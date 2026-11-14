import { DatabaseSync } from "node:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  createHash,
  createHmac,
  randomUUID,
} from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const MAX = 32 * 1024 * 1024;
const key = (master, salt) => {
  if (!/^[a-f0-9]{64}$/i.test(master || ""))
    throw Error("백업 암호화 설정이 필요합니다.");
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(master, "hex"),
      salt,
      "WORKNIC-private-backup-v1",
      32,
    ),
  );
};
export function encryptBackup(bytes, master, at = Date.now()) {
  if (bytes.length > MAX)
    throw Error("백업 크기 제한을 초과했습니다. 담당자 확인이 필요합니다.");
  const salt = randomBytes(16),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(master, salt), iv);
  cipher.setAAD(Buffer.from("WORKNIC-BACKUP-v1"));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      format: "WORKNIC-BACKUP-v1",
      createdAt: at,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      sha256: hash(bytes),
      bytes: encrypted.toString("base64"),
    }),
  );
}
export function decryptBackup(envelope, master) {
  if (envelope.length > MAX * 1.5) throw Error("백업 크기를 확인해 주세요.");
  const v = JSON.parse(envelope);
  if (
    v.format !== "WORKNIC-BACKUP-v1" ||
    !/^[a-f0-9]{32}$/.test(v.salt) ||
    !/^[a-f0-9]{24}$/.test(v.iv) ||
    !/^[a-f0-9]{32}$/.test(v.tag)
  )
    throw Error("백업 형식을 확인해 주세요.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(master, Buffer.from(v.salt, "hex")),
    Buffer.from(v.iv, "hex"),
  );
  decipher.setAAD(Buffer.from("WORKNIC-BACKUP-v1"));
  decipher.setAuthTag(Buffer.from(v.tag, "hex"));
  const bytes = Buffer.concat([
    decipher.update(Buffer.from(v.bytes, "base64")),
    decipher.final(),
  ]);
  if (hash(bytes) !== v.sha256) throw Error("백업 검증에 실패했습니다.");
  return bytes;
}

// Optional S3-compatible private destination. Never enabled by default.
// Destination and credentials are environment-only; the admin UI cannot redirect data.
export function s3Transport(env, fetcher = fetch) {
  if (env.TRADE_BACKUP_DESTINATION_APPROVED !== "1") return null;
  const endpoint = new URL(env.TRADE_BACKUP_S3_PREFIX || "");
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.endsWith("/")
  )
    throw Error("비공개 HTTPS 백업 저장 위치를 확인해 주세요.");
  const access = env.TRADE_BACKUP_ACCESS_KEY,
    secret = env.TRADE_BACKUP_SECRET_KEY,
    region = env.TRADE_BACKUP_REGION;
  if (!access || !secret || !/^[a-z0-9-]+$/.test(region || ""))
    throw Error("외부 백업 인증 설정을 확인해 주세요.");
  const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
  const request = async (method, filename, body, at) => {
    const url = new URL(filename, endpoint),
      amzDate = new Date(at).toISOString().replace(/[:-]|\.\d{3}/g, ""),
      day = amzDate.slice(0, 8),
      payload = hash(body || Buffer.alloc(0));
    const headers = {
      host: url.host,
      "x-amz-content-sha256": payload,
      "x-amz-date": amzDate,
    };
    if (env.TRADE_BACKUP_SESSION_TOKEN)
      headers["x-amz-security-token"] = env.TRADE_BACKUP_SESSION_TOKEN;
    if (method === "PUT") headers["if-none-match"] = "*";
    const names = Object.keys(headers).sort(),
      signed = names.join(";"),
      canonical = [
        method,
        url.pathname,
        "",
        names.map((n) => n + ":" + headers[n].trim() + "\n").join(""),
        signed,
        payload,
      ].join("\n");
    const scope = `${day}/${region}/s3/aws4_request`,
      signingKey = hmac(
        hmac(hmac(hmac("AWS4" + secret, day), region), "s3"),
        "aws4_request",
      );
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${createHmac(
      "sha256",
      signingKey,
    )
      .update(["AWS4-HMAC-SHA256", amzDate, scope, hash(canonical)].join("\n"))
      .digest("hex")}`;
    const response = await fetcher(url, {
      method,
      headers,
      body: method === "PUT" ? body : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw Error("외부 백업 전송 또는 검증에 실패했습니다.");
    return response;
  };
  return {
    async putAndVerify(filename, bytes, at) {
      await request("PUT", filename, bytes, at);
      const response = await request("GET", filename, null, Date.now());
      if (Number(response.headers.get("content-length")) > MAX * 1.5)
        throw Error("외부 백업 크기를 확인해 주세요.");
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > MAX * 1.5) throw Error("외부 백업 크기를 확인해 주세요.");
        chunks.push(chunk);
      }
      if (hash(Buffer.concat(chunks)) !== hash(bytes))
        throw Error("외부 백업 검증에 실패했습니다.");
    },
  };
}

export function createBackupService({
  dataDir,
  masterKey,
  transport = null,
  clock = Date.now,
}) {
  const directory = resolve(dataDir, "encrypted-backups"),
    stateFile = join(directory, "status.json");
  let busy = false,
    state = { lastLocalAt: null, lastExternalAt: null, lastErrorAt: null };
  const initialized = mkdir(directory, { recursive: true, mode: 0o700 })
    .then(async () => {
      try {
        state = JSON.parse(await readFile(stateFile, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    })
    .catch(() => {
      state.lastErrorAt = clock();
    });
  const save = async () => {
    const temporary = stateFile + ".tmp";
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, stateFile);
  };
  const status = () => ({
    configured: /^[a-f0-9]{64}$/i.test(masterKey || ""),
    externalConfigured: !!transport,
    busy,
    ...state,
  });
  async function run({ force = false, external = true } = {}) {
    await initialized;
    if (busy) throw Error("백업이 진행 중입니다.");
    if (
      !force &&
      state.lastLocalAt &&
      clock() - state.lastLocalAt < 24 * 3600000 &&
      (!transport || state.lastExternalAt >= state.lastLocalAt)
    )
      return null;
    busy = true;
    let temporary;
    try {
      if (
        !force &&
        transport &&
        state.lastFilename &&
        state.lastLocalAt &&
        clock() - state.lastLocalAt < 24 * 3600000
      ) {
        const envelope = await readFile(join(directory, state.lastFilename));
        decryptBackup(envelope, masterKey);
        await transport.putAndVerify(state.lastFilename, envelope, clock());
        state.lastExternalAt = clock();
        state.lastErrorAt = null;
        await save();
        return null;
      }
      temporary = await mkdtemp(join(tmpdir(), "worknic-backup-"));
      const snapshot = join(temporary, "snapshot.sqlite"),
        source = new DatabaseSync(resolve(dataDir, "trade.sqlite"), {
          readOnly: true,
        });
      try {
        source.exec("PRAGMA busy_timeout=10000");
        source.prepare("VACUUM main INTO ?").run(snapshot);
      } finally {
        source.close();
      }
      if ((await stat(snapshot)).size > MAX) throw Error("백업 크기 제한 초과");
      const check = new DatabaseSync(snapshot, { readOnly: true });
      try {
        if (
          check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
        )
          throw Error("데이터 무결성 확인 실패");
      } finally {
        check.close();
      }
      const plaintext = await readFile(snapshot),
        envelope = encryptBackup(plaintext, masterKey, clock());
      // Verify decryption before retaining or transmitting any archive.
      if (hash(decryptBackup(envelope, masterKey)) !== hash(plaintext))
        throw Error("암호화 복구 검증 실패");
      const filename = `worknic-${new Date(clock()).toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.wnbk`,
        output = join(directory, filename);
      await writeFile(output, envelope, { mode: 0o600, flag: "wx" });
      if (hash(await readFile(output)) !== hash(envelope))
        throw Error("저장된 백업 확인 실패");
      state.lastLocalAt = clock();
      state.lastFilename = filename;
      state.lastErrorAt = null;
      await save();
      if (transport && external) {
        await transport.putAndVerify(filename, envelope, clock());
        state.lastExternalAt = clock();
        await save();
      }
      for (const name of await readdir(directory))
        if (
          /^worknic-[a-zA-Z0-9.-]+\.wnbk$/.test(name) &&
          (await stat(join(directory, name))).mtimeMs < clock() - 30 * 86400000
        )
          await rm(join(directory, name));
      return { filename, bytes: envelope };
    } catch (e) {
      state.lastErrorAt = clock();
      await save();
      throw Error(
        "백업 실행에 실패했습니다. 저장 위치·암호화 설정·용량을 확인해 주세요.",
      );
    } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true });
      busy = false;
    }
  }
  return {
    status,
    initialized,
    run,
    start() {
      const tick = () =>
        run()
          .then((result) => {
            if (result)
              console.info(
                "일일 암호화 백업 생성·검증 완료. " +
                  (transport
                    ? "외부 저장소 전송·검증 완료."
                    : "외부 저장소 미연결."),
              );
          })
          .catch(() =>
            console.error(
              "백업 실행 실패. 운영 설정에서 백업 상태를 확인해 주세요.",
            ),
          );
      const first = setTimeout(tick, 30000);
      first.unref();
      const timer = setInterval(tick, 3600000);
      timer.unref();
      return () => {
        clearTimeout(first);
        clearInterval(timer);
      };
    },
  };
}
