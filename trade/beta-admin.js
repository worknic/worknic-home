import {
  $,
  el,
  call,
  login,
  logout,
  button,
  link,
  field,
  formTask,
  card,
  dl,
  money,
  date,
  labels,
  say,
} from "./beta-common.js";
import { adminRefunds, adminRecovery, orderAftercare } from "./aftercare-ui.js";
import { inventoryBulk, operationsReadiness } from "./inventory-ui.js";
import {businessEnrollmentAdmin} from './business-enrollment-admin.js';
let actor = null,
  lastPreview = null;
async function prices(root) {
  await inventoryBulk(root, route);
  const c = card("�ǸŰ� ���� �ϰ� ����");
  c.append(
    el(
      "p",
      "���� ���� �ǸŰ��� �������� ��մϴ�. ��ü�� �ܰ��� �������ֹ����� �ش� �������� �Է��մϴ�. ���� ���� ����ǥ�� Ȯ���Ǹ� �ֽ� ���� ������� ������ �� �ֽ��ϴ�.",
    ),
    link("�ǸŰ� ���� �����ޱ�", "/api/beta/admin/prices/template"),
  );
  const f = el("form"),
    file = field(f, "file", "�ǸŰ� ���� ����", "", "file");
  file.accept = ".xlsx";
  const preview = el("div");
  f.append(el("button", "���� �̸�����", "button"));
  formTask(f, async () => {
    if (!file.files[0]) throw Error("���� ������ ������ �ּ���.");
    const r = await fetch("/api/beta/admin/prices/file", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/octet-stream" },
        body: file.files[0],
        signal: AbortSignal.timeout(45000),
      }),
      j = await r.json();
    if (!r.ok) throw Error(j.error);
    lastPreview = j;
    preview.replaceChildren(
      el("p", `���� ���� ${j.valid}�� �� ���� ${j.invalid}��`),
    );
    const table = el("table"),
      head = el("tr");
    for (const label of [
      "��",
      "��ǰ���ɼ�",
      "���� ����",
      "�� ����",
      "���� ���",
    ])
      head.append(el("th", label));
    table.append(head);
    for (const x of j.rows) {
      const row = el("tr");
      for (const text of [
        x.row,
        x.after ? x.after.productId + " / " + x.after.optionId : "Ȯ�� �ʿ�",
        x.before?.price == null ? "����" : money(x.before.price),
        x.after?.price == null ? "����" : money(x.after.price),
        x.errors.join(" / ") || "���� ����",
      ])
        row.append(el("td", text));
      table.append(row);
    }
    const wrap = el("div", null, "table-wrap");
    wrap.append(table);
    preview.append(wrap);
    if (!j.invalid)
      preview.append(
        button("Ȯ���� ���� �ϰ� ����", async () => {
          const r = await call("/admin/prices/apply", { id: lastPreview.id });
          lastPreview = null;
          say(
            r.applied +
              "�� �ǸŰ��� �����߽��ϴ�. ���� �������ֹ� �ݾ��� �����˴ϴ�.",
          );
          route();
        }),
      );
  });
  c.append(f, preview);
  c.append(
    button(
      "���� �ǸŰ� ��� ��������",
      async () => {
        if (
          !confirm(
            "���� �ǸŰ��� ��� �������� ��ȯ�ұ��? ���� �������ֹ� �ݾװ� ����� �����˴ϴ�.",
          )
        )
          return;
        const r = await call("/admin/prices/undetermined", { confirmed: true });
        say(r.applied + "�� ��ǰ���ɼ��� ���� �ǸŰ��� �������� ��ȯ�߽��ϴ�.");
        route();
      },
      "button secondary",
    ),
  );
  root.append(c);
  const { history } = await call("/admin/prices/history");
  for (const h of history) {
    const item = card("���� ���� ���� �� " + date(h.created_at));
    item.append(
      el("p", h.status === "restored" ? "���� ���� ������" : "�ϰ� ���� �Ϸ�"),
    );
    let restoreConfirmation;
    if (h.status === "applied")
      item.append(
        button(
          "���� �������� ����",
          async () => {
            if (restoreConfirmation?.isConnected) return;
            restoreConfirmation = el("div");
            restoreConfirmation.append(
              el("p", "���� ���� �������� ���� ������ ���� ������ �����ұ��?"),
              button("���� Ȯ��", async () => {
                await call("/admin/prices/restore", { id: h.id });
                say("���� ������ �����߽��ϴ�.");
                route();
              }),
              button(
                "���",
                () => restoreConfirmation.remove(),
                "button secondary",
              ),
            );
            item.append(restoreConfirmation);
          },
          "button secondary",
        ),
      );
    root.append(item);
  }
  const stocks = card("�ֹ� ���� ����");
  stocks.append(
    button(
      "���� ��ǰ ����ȭ",
      async () => {
        const r = await call("/admin/catalog-sync", {});
        say(
          r.imported + "�� ���� ��ǰ�� ����ȭ�߽��ϴ�. ���ݡ������� �����˴ϴ�.",
        );
        route();
      },
      "button secondary",
    ),
  );
  const search = field(stocks, "stockSearch", "��ǰ �˻�");
  search.required = false;
  const list = el("div", null, "cards");
  stocks.append(list);
  const { products } = await call("/admin/products");
  const render = () => {
    list.replaceChildren(
      ...products
        .filter((p) =>
          [p.name, p.model, p.id]
            .join(" ")
            .toLowerCase()
            .includes(search.value.toLowerCase()),
        )
        .slice(0, 30)
        .map((p) => {
          const f = el("form", null, "stock-item");
          f.append(el("p", p.name + " �� " + p.model + " �� " + p.optionLabel));
          field(f, "stock", "�ֹ� ���� ����", p.stock, "number");
          field(f, "enabled", "���� Ȯ�Ρ��ֹ� ����", p.enabled, "checkbox");
          f.append(el("button", "���� ����", "button"));
          formTask(f, async (d) => {
            await call("/admin/products/stock", {
              id: p.id,
              optionId: p.optionId,
              revision: p.revision,
              stock: Number(d.stock),
              enabled: d.enabled === "on",
            });
            say("������ �����߽��ϴ�.");
            route();
          });
          return f;
        }),
    );
  };
  search.oninput = render;
  render();
  root.append(stocks);
}
async function members(root) {
  businessEnrollmentAdmin(root);
  root.append(
    el(
      "p",
      "ȸ�� ������ ���� OS �����ȸ�� �������� ó���մϴ�. ���⼭�� ���ε� ����������� ������ �����ϰ� ���� ����� ����ó�� Ȯ���� �� ���� Ȯ�� ��ũ�� �غ��մϴ�.",
      "muted",
    ),
    link("OS ����� ���� ����", "https://worknic.tools/business-members/"),
  );
  const { members } = await call("/admin/members");
  for (const m of members) {
    const c = card(m.profile.companyName);
    c.append(
      el(
        "p",
        m.username + " �� " + m.profile.businessNumber + " �� " + m.profile.email,
      ),
      el(
        "p",
        "�ŷ� ���� ��� ����: " +
          (labels[m.status] || m.status) +
          " �� ���� �ŷ� ������ OS ����� ���ο��� Ȯ���մϴ�.",
        "muted",
      ),
    );
    const f = el("form");
    field(
      f,
      "checked",
      "��ϵ� ����ڿ� ���� �����Ͽ� ���� ����ڸ� Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    f.append(el("button", "OS ���� ���������� Ȯ�� ��ũ �����", "button"));
    formTask(f, async () => {
      const r = await call("/admin/members/bind", {
          id: m.id,
          contactVerified: true,
        }),
        url =
          location.origin +
          "/trade/#account?activate=" +
          encodeURIComponent(r.token),
        box = el("div");
      box.append(
        el(
          "p",
          "��ϵ� ����ڿ��� �����ϼ���. 30�� ���� �� ���� ����� �� �ֽ��ϴ�.",
          "muted",
        ),
      );
      const a = el("a", "���� Ȯ�� ��ũ");
      a.href = url;
      box.append(a);
      c.append(box);
    });
    c.append(f);
    root.append(c);
  }
}
async function quotes(root) {
  const { quotes } = await call("/admin/quotes");
  for (const q of quotes) {
    const c = card("���� " + q.id.slice(0, 8));
    c.append(
      el("span", labels[q.status] || q.status, "badge"),
      el(
        "p",
        "�ŷ�ó: " +
          (q.companyName || "�ŷ� ���� Ȯ�� �ʿ�") +
          " �� " +
          (q.businessNumber || ""),
      ),
      el(
        "p",
        q.items
          .map((x) => x.name + " �� " + x.optionId + " �� " + x.quantity)
          .join(" / "),
      ),
      el("p", q.locationName),
    );
    if (q.status === "requested") {
      const f = el("form");
      f.append(
        el(
          "p",
          "��ü�� �ܰ��� �� �������� �����մϴ�. ���� �ǸŰ��� �ٸ� ��ü�� ������ ������� �ʽ��ϴ�.",
        ),
      );
      const individual = q.items.map((line, i) => {
        const box = card(
          line.name +
            " �� " +
            line.model +
            " �� " +
            (line.optionLabel || line.optionId) +
            " �� ��û ���� " +
            line.quantity,
        );
        const amount = field(box, "amount" + i, "���� �ܰ� �� ��", "", "number");
        amount.min = 1;
        amount.max = 100000000;
        const unit = field(box, "unit" + i, "Ȯ���� �ǸŴ���");
        const label = el("label", "�ΰ��� ����"),
          tax = el("select");
        tax.required = true;
        for (const [value, name] of [
          ["", "������ �ּ���"],
          ["����", "�ΰ��� ����"],
          ["����", "�ΰ��� ����"],
        ]) {
          const o = el("option", name);
          o.value = value;
          tax.append(o);
        }
        label.append(tax);
        box.append(label);
        f.append(box);
        return { line, amount, unit, tax };
      });
      field(f, "pickupFee", "�Ⱦ� ��� �� ����", 0, "number").readOnly = true;
      field(f, "expiresAt", "���� ��ȿ�Ⱓ", "", "datetime-local");
      field(
        f,
        "specialOrder",
        "���� ��ü�� �ֹ����ۡ����� ���� ��ǰ�̸�, �Ϲ� ��� ��ǰ�� ���� �ʾҽ��ϴ�.",
        false,
        "checkbox",
      );
      f.append(
        el(
          "p",
          "�ֹ����ۡ����� ���� ��ǰ�� ��� ������ ������ �����մϴ�. �Ϲ� ��� ��ǰ�� ���� �������� ��������.",
          "muted",
        ),
      );
      field(
        f,
        "checked",
        "����ǥ���԰ݡ�����ǰ���������Ⱦ� ����� Ȯ���߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "������ ����", "button"));
      formTask(f, async (d) => {
        await call("/admin/quotes/issue", {
          id: q.id,
          revision: q.revision,
          pickupFee: Number(d.pickupFee),
          expiresAt: new Date(d.expiresAt).getTime(),
          conditionsConfirmed: true,
          specialOrder: d.specialOrder === "on",
          specialOrderAcknowledged: d.specialOrder === "on",
          items: individual.map(({ line, amount, unit, tax }) => ({
            productId: line.productId,
            optionId: line.optionId,
            unitPrice: Number(amount.value),
            unit: unit.value,
            taxMode: tax.value,
          })),
        });
        say("�������� �����߽��ϴ�.");
        route();
      });
      c.append(f);
    } else if (q.total)
      c.append(
        dl([
          ["�հ�", money(q.total)],
          ["����", date(q.issuedAt)],
        ]),
        link("������ ����", "/api/beta/quotes/" + q.id + "/print"),
      );
    root.append(c);
  }
  await orderList(false, root);
}
async function orderList(pickupOnly, root) {
  const { orders } = await call("/admin/orders");
  const { refunds = [] } = await call("/admin/refunds");
  root.append(el("h2", pickupOnly ? "�Ⱦ� �ֹ�" : "Ȯ�� �ֹ�"));
  for (const o of orders) {
    const refundHold = refunds.some(
      (r) => r.orderId === o.id && ["requested", "approved"].includes(r.status),
    );
    const c = card(o.number);
    c.append(
      el("span", labels[o.status] || o.status, "badge"),
      dl([
        ["�ŷ�ó", o.buyer.companyName],
        ["����ó", o.buyer.phone],
        ["�հ�", money(o.total)],
        ["�Ⱦ�", o.fulfillment?.locationName || "���"],
      ]),
      link("�ŷ�������", "/api/beta/orders/" + o.id + "/statement"),
    );
    orderAftercare(c, o, refunds, route, true);
    if (o.specialOrder) {
      c.append(
        el("p", o.cancellationPolicy),
        el(
          "p",
          o.procurement?.state === "started"
            ? "���ۡ����� ���� ���: " + date(o.procurement.startedAt)
            : "���ۡ����� ��",
        ),
      );
      if (
        !refundHold &&
        ["paid", "preparing"].includes(o.status) &&
        o.procurement?.state !== "started"
      ) {
        const sf = el("form");
        field(
          sf,
          "reference",
          "���� ���ۡ����� ���� ���� Ȯ�ι�ȣ �� �������� �������� ����",
        );
        field(
          sf,
          "confirmed",
          "���� ���ۡ����ָ� ����������, �� ȭ���� ���޻� ���ָ� ������� ������ Ȯ���߽��ϴ�.",
          false,
          "checkbox",
        ).required = true;
        sf.append(el("button", "���ۡ����� ���� ���", "button secondary"));
        formTask(sf, async (d) => {
          await call("/admin/orders/special-start", {
            id: o.id,
            orderRevision: o.revision,
            reference: d.reference,
            actualStartConfirmed: true,
          });
          say(
            "���� ���ۡ����� ������ ����߽��ϴ�. ���� �ܼ� ���� ��Ҵ� �Ǻ� �����մϴ�.",
          );
          route();
        });
        c.append(sf);
      }
    }
    if (o.status === "pending_payment") {
      const f = el("form");
      field(f, "amount", "���� �Աݾ�", "", "number");
      field(f, "reference", "�Ա��� �Ǵ� Ȯ�ι�ȣ");
      field(
        f,
        "checked",
        "���� ���� ������ �Աݾ��� Ȯ���߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "�Ա� Ȯ��", "button"));
      formTask(f, async (d) => {
        await call("/admin/orders/update", {
          id: o.id,
          revision: o.revision,
          action: "confirm_payment",
          amount: Number(d.amount),
          reference: d.reference,
          bankChecked: true,
        });
        say("�Ա��� Ȯ���߽��ϴ�.");
        route();
      });
      c.append(f);
    }
    if (
      pickupOnly &&
      !refundHold &&
      ["paid", "preparing"].includes(o.status) &&
      !o.pickup &&
      o.fulfillment?.locationId === "jinjeop"
    ) {
      const f = el("form");
      f.append(
        el("h3", "���� ����� ��� ����"),
        el(
          "p",
          "�����԰� ��й�ȣ ����, Ȯ�ε� ����ڰ� ���� �����մϴ�. �Ⱦ� ����� �����Դϴ�.",
        ),
      );
      field(f, "meetingPoint", "��Ȯ�� ���� ����", o.fulfillment.address);
      field(f, "staffContact", "�������� �ȳ��� ����ڡ����� ����ó");
      field(f, "availableFrom", "���� ����", "", "datetime-local");
      field(f, "availableUntil", "���� ����", "", "datetime-local");
      field(
        f,
        "staged",
        "��ǰ�������� ��� ���޿����� �غ��߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      field(
        f,
        "staffConfirmed",
        "���� ����ڿ� ���� ��ҡ��ð��� Ȯ���߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "��� ���� �غ� �Ϸ�", "button"));
      formTask(f, async (d) => {
        await call("/admin/handoffs/ready", {
          ...d,
          id: o.id,
          revision: o.revision,
          availableFrom: new Date(d.availableFrom).getTime(),
          availableUntil: new Date(d.availableUntil).getTime(),
          staged: true,
          staffConfirmed: true,
        });
        say(
          "��� ���� �غ� �����߽��ϴ�. �������� ��ҡ��ð��� �ȳ��� �ּ���.",
        );
        route();
      });
      c.append(f);
    }
    if (
      pickupOnly &&
      !refundHold &&
      ["paid", "preparing"].includes(o.status) &&
      !o.pickup &&
      o.fulfillment?.locationId !== "jinjeop"
    ) {
      const { slots } = await call("/admin/slots"),
        f = el("form"),
        label = el("label", "������"),
        select = el("select");
      select.name = "slotId";
      for (const s of slots.filter(
        (s) => s.location_id === o.fulfillment?.locationId && s.enabled,
      )) {
        const op = el("option", s.label);
        op.value = s.id;
        select.append(op);
      }
      label.append(select);
      f.append(label);
      const pin = field(
        f,
        "pin",
        "���� �����ġ�� ������ ���� ��й�ȣ",
        "",
        "password",
      );
      pin.pattern = "[0-9]{6,12}";
      pin.autocomplete = "off";
      const startNow = field(
        f,
        "startNow",
        "�غ� �Ϸ� ó�� �������� ���� ����",
        o.fulfillment?.locationId !== "jinjeop",
        "checkbox",
      );
      const from = field(f, "availableFrom", "���� ����", "", "datetime-local");
      const syncStart = () => {
        from.disabled = startNow.checked;
        from.required = !startNow.checked;
      };
      startNow.addEventListener("change", syncStart);
      syncStart();
      field(f, "availableUntil", "���� ����", "", "datetime-local");
      field(
        f,
        "staged",
        "��ǰ�������� �����Կ� ��ġ�߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      field(
        f,
        "physical",
        "�ش� �����ġ�� ���� ��й�ȣ�� ������ ������Ȯ���߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "�Ⱦ� �غ� �Ϸ�", "button"));
      formTask(f, async (d) => {
        await call("/admin/pickups/ready", {
          ...d,
          id: o.id,
          revision: o.revision,
          availableFrom:
            d.startNow === "on"
              ? Date.now()
              : new Date(d.availableFrom).getTime(),
          availableUntil: new Date(d.availableUntil).getTime(),
          staged: true,
          physicalCodeConfigured: true,
        });
        f.reset();
        say(
          "�Ⱦ� �غ� �Ϸ� ���·� �����߽��ϴ�. �������� �ۿ��� ���� �Ⱓ�� �ڵ带 Ȯ���ϵ��� �ȳ��� �ּ���.",
        );
        route();
      });
      c.append(f);
    }
    if (pickupOnly && !refundHold && o.pickup?.mode === "handoff") {
      c.append(
        dl([
          ["���� ���", "����� ��� ����"],
          ["���� ����", o.pickup.meetingPoint],
          ["����ڡ����� ����ó", o.pickup.staffContact],
          ["���� ����", date(o.pickup.availableFrom)],
          ["���� ����", date(o.pickup.availableUntil)],
          ["����", labels[o.pickup.status] || o.pickup.status],
        ]),
      );
      const f = el("form"),
        label = el("label", "��� ���� ���"),
        result = el("select");
      result.name = "result";
      for (const [value, name] of [
        ["collected", "�����ڿ��� ���� ���� �Ϸ�"],
        ["not_collected", "�Ⱓ ���ᡤ�̼���"],
      ]) {
        const option = el("option", name);
        option.value = value;
        result.append(option);
      }
      label.append(result);
      f.append(label);
      field(
        f,
        "recipientChecked",
        "���� �����ڡ���ǰ������ �Ǵ� �̼��� ����� Ȯ���߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "��� ���� ��� ����", "button"));
      formTask(f, async (d) => {
        await call("/admin/handoffs/close", {
          id: o.id,
          revision: o.pickup.revision,
          result: d.result,
          recipientChecked: true,
        });
        say("��� ���� ����� ����߽��ϴ�.");
        route();
      });
      c.append(f);
    }
    if (pickupOnly && !refundHold && o.pickup && o.pickup.mode !== "handoff") {
      c.append(
        dl([
          ["������", o.pickup.slotLabel],
          ["���� ����", date(o.pickup.availableUntil)],
          ["����", labels[o.pickup.status] || o.pickup.status],
        ]),
      );
      const f = el("form"),
        label = el("label", "���� Ȯ�� ���"),
        s = el("select");
      s.name = "result";
      for (const [v, t] of [
        ["collected", "���� �Ϸ� Ȯ��"],
        ["not_collected", "�̼��ɡ������ ó��"],
      ]) {
        const op = el("option", t);
        op.value = v;
        s.append(op);
      }
      label.append(s);
      f.append(label);
      field(
        f,
        "compartment",
        "�������� ���� ��ǰ������ ���θ� Ȯ���߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      field(
        f,
        "revoked",
        "���� �����ġ���� ���� ��й�ȣ�� ���桤����߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "���� Ȯ�Ρ������� ��� ����", "button"));
      formTask(f, async (d) => {
        await call("/admin/pickups/close", {
          id: o.id,
          revision: o.pickup.revision,
          result: d.result,
          physicalCodeRevoked: true,
          compartmentChecked: true,
        });
        say("Ȯ�� ����� �����ϰ� �������� ������ϴ�.");
        route();
      });
      c.append(f);
    }
    root.append(c);
  }
}
async function pickups(root) {
  await orderList(true, root);
}
async function settings(root) {
  await operationsReadiness(root);
  const config = await call("/admin/config"),
    c = card("��Ÿ ����");
  const policy = card("Ȯ�� � ���� �� �Ϲ� ��� ��ǰ ���");
  policy.append(
    el(
      "p",
      "�Ϲ� ��� ��ǰ�� ���� �� ��� �� ���� �Աݾ� ���� ȯ��. ����ڰ� ��ǰ �غ������� �ߴ��� �� ó���մϴ�.",
    ),
  );
  if (config.standardPreReceiptCancellation?.value === "full_refund")
    policy.append(
      el(
        "p",
        "Ȯ�� ����� �� " +
          date(config.standardPreReceiptCancellation.confirmedAt),
      ),
    );
  else {
    const pf = el("form");
    field(
      pf,
      "confirmed",
      "�Ϲ� ��� ��ǰ�� ���� �� ���� ȯ�� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    pf.append(el("button", "��� ���� Ȯ�� ����", "button"));
    formTask(pf, async () => {
      await call("/admin/policies/standard-cancellation", {
        revision: config.revision,
        value: "full_refund",
        confirmed: true,
      });
      say("�Ϲ� ��� ��ǰ�� ���� �� ���� ȯ�� ������ �����߽��ϴ�.");
      route();
    });
    policy.append(pf);
  }
  root.append(policy);
  const specialPolicy = card("Ȯ�� � ���� �� �ֹ����ۡ����� ���� ��ǰ");
  specialPolicy.append(
    el(
      "p",
      "�ܼ� ���� ��Ҵ� ���ۡ����� �� ���� ȯ��, ���� �� �Ǻ� ���Ƿ� ó���մϴ�. ������ �ش� ��ǰ���� �����ϰ� ���� ���� ����� ����ϴ�.",
    ),
  );
  if (
    config.specialOrderCancellation?.value ===
    "full_before_start_agreement_after"
  )
    specialPolicy.append(
      el(
        "p",
        "Ȯ�� ����� �� " + date(config.specialOrderCancellation.confirmedAt),
      ),
    );
  else {
    const sf = el("form");
    field(
      sf,
      "confirmed",
      "�ֹ����ۡ����� ���� ��ǰ�� ���� �� ���� ȯ�ҡ����� �� �Ǻ� ���� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    sf.append(el("button", "Ư�� ��ǰ ��� ���� Ȯ�� ����", "button"));
    formTask(sf, async () => {
      await call("/admin/policies/special-cancellation", {
        revision: config.revision,
        value: "full_before_start_agreement_after",
        confirmed: true,
      });
      say("�ֹ����ۡ����� ���� ��ǰ�� ��� ������ �����߽��ϴ�.");
      route();
    });
    specialPolicy.append(sf);
  }
  root.append(specialPolicy);
  const returnPolicy = card("Ȯ�� � ���� �� �Ϲ� ��� �ܼ� ���� ��ǰ �Ⱓ");
  returnPolicy.append(
    el(
      "p",
      "���� ���� �������� 1��°�� ����Ͽ� 7��° �ѱ� �ð� 23:59���� ��û�մϴ�. ��ǰ ����� ���� Ȯ���մϴ�.",
    ),
  );
  if (config.standardReturnPeriod?.days === 7)
    returnPolicy.append(
      el("p", "Ȯ�� ����� �� " + date(config.standardReturnPeriod.confirmedAt)),
    );
  else {
    const rf = el("form");
    field(
      rf,
      "confirmed",
      "�Ϲ� ��� ��ǰ�� ���� ���������� 7�� �̳� ��ǰ ���� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    rf.append(el("button", "��ǰ �����Ⱓ Ȯ�� ����", "button"));
    formTask(rf, async () => {
      await call("/admin/policies/standard-return-period", {
        revision: config.revision,
        days: 7,
        confirmed: true,
      });
      say("�Ϲ� ��� ��ǰ�� �ܼ� ���� ��ǰ �����Ⱓ�� 7�Ϸ� �����߽��ϴ�.");
      route();
    });
    returnPolicy.append(rf);
  }
  root.append(returnPolicy);
  const conditionPolicy = card("Ȯ�� � ���� �� �ܼ� ���� ��ǰ�� ��ǰ ����");
  conditionPolicy.append(
    el(
      "p",
      "��ǰ�� �̻���̰� ����ǰ���󺧡������� ������ ������ ��� �ܺ� �ڽ� ������ ����մϴ�. ��ǰ ����� ���� Ȯ���մϴ�.",
    ),
  );
  if (
    config.standardReturnCondition?.value ===
    "unused_complete_outer_box_open_allowed"
  )
    conditionPolicy.append(
      el(
        "p",
        "Ȯ�� ����� �� " + date(config.standardReturnCondition.confirmedAt),
      ),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "�̻�롤����ǰ���󺧡����� ���� �� �ܺ� �ڽ� ���� ��� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "��ǰ ��ǰ ���� ���� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/policies/standard-return-condition", {
        revision: config.revision,
        value: "unused_complete_outer_box_open_allowed",
        confirmed: true,
      });
      say("�ܼ� ���� ��ǰ�� ��ǰ ���� ������ �����߽��ϴ�.");
      route();
    });
    conditionPolicy.append(cf);
  }
  root.append(conditionPolicy);
  const shippingPolicy = card("Ȯ�� � ���� �� �ܼ� ���� ��ǰ ȸ�� ��ۺ�");
  shippingPolicy.append(
    el(
      "p",
      "�Ϲ� ��� ��ǰ�� �ܼ� ���� ��ǰ ȸ�� ��ۺ�� ���� �δ��Դϴ�. ���� ��롤���� ����� ���� �� �ȳ��ϸ� �ڵ� �������� �ʽ��ϴ�. ���� ��ۺ�� �Ʒ� ���� �������� �ȳ��ϸ� �ҷ�������� ����� �Ʒ� ���� �������� �ȳ��մϴ�.",
    ),
  );
  if (config.standardReturnShipping?.value === "customer_pays_collection")
    shippingPolicy.append(
      el(
        "p",
        "Ȯ�� ����� �� " + date(config.standardReturnShipping.confirmedAt),
      ),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "�ܼ� ���� ��ǰ ȸ�� ��ۺ��� ���� �δ� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "��ǰ ȸ�� ��ۺ� ���� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/policies/standard-return-shipping", {
        revision: config.revision,
        value: "customer_pays_collection",
        confirmed: true,
      });
      say("�ܼ� ���� ��ǰ ȸ�� ��ۺ� ������ �����߽��ϴ�.");
      route();
    });
    shippingPolicy.append(cf);
  }
  root.append(shippingPolicy);
  const outboundPolicy = card("Ȯ�� � ���� �� ���� ��ǰ ���� �߼� ��ۺ�");
  outboundPolicy.append(
    el(
      "p",
      "�Ϲ� ��� ��ǰ�� �ù� ���� �� ���� �ܼ� ���� ��ǰ�� �� ���� �߼� ��ۺ�� ������ �ֹ��� ������ ��ũ���� �δ��մϴ�. �������� ���� �߼� ����� �߰� û���ϰų� ȯ�Ҿ׿��� �������� �ʽ��ϴ�. ��ǰ ȸ�� ��ۺ�� ���� �δ��̸� ���� �Ⱦ����� �������� �ʽ��ϴ�.",
    ),
  );
  if (
    config.standardOutboundShipping?.value ===
    "worknic_pays_outbound_full_return"
  )
    outboundPolicy.append(
      el(
        "p",
        "Ȯ�� ����� �� " + date(config.standardOutboundShipping.confirmedAt),
      ),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "�ù� ���� �ܼ� ���� ��ǰ�� ���� �߼� ��ۺ� ��ũ�� �δ� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "���� �߼� ��ۺ� ���� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/policies/standard-outbound-shipping", {
        revision: config.revision,
        value: "worknic_pays_outbound_full_return",
        confirmed: true,
      });
      say("���� ��ǰ ���� �߼� ��ۺ� ������ �����߽��ϴ�.");
      route();
    });
    outboundPolicy.append(cf);
  }
  root.append(outboundPolicy);
  const defectPolicy = card("Ȯ�� � ���� �� �ҷ�������� ȸ������߼� ���");
  defectPolicy.append(
    el(
      "p",
      "��ǰ �ҷ��̳� ������� Ȯ�ε� ��� ��ȯ����ǰ�� �ʿ��� ȸ����� ��߼ۺ�� ��� ��ũ���� �δ��մϴ�. �ܼ� ���� ��� ���ذ� �����ϸ� �������� �ش� ��ۺ� û���ϰų� ȯ�Ҿ׿��� �������� �ʽ��ϴ�.",
    ),
  );
  if (config.defectShipping?.value === "worknic_pays_collection_reshipment")
    defectPolicy.append(
      el("p", "Ȯ�� ����� �� " + date(config.defectShipping.confirmedAt)),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "�ҷ�������� Ȯ�� �� ȸ������߼ۺ� ��ũ�� �δ� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "�ҷ�������� ��ۺ� ���� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/policies/defect-shipping", {
        revision: config.revision,
        value: "worknic_pays_collection_reshipment",
        confirmed: true,
      });
      say("�ҷ�������� ȸ������߼� ��� ������ �����߽��ϴ�.");
      route();
    });
    defectPolicy.append(cf);
  }
  root.append(defectPolicy);
  const reviewerPolicy = card("� ����� �� ��ҡ���ǰ ���� �� ȯ�� ����");
  reviewerPolicy.append(
    el(
      "p",
      "��ҡ���ǰ ������ ��ǰ ���� ���� �� ȯ�� ���� ����ڴ� �����Դϴ�. ���Ρ��ݷ����۱� �� ���� öȸ�� ������ OS �������� ó���մϴ�." +
        (config.refundTransferOperator?.value
          ? " ���� ȯ�� �۱� �����: " + config.refundTransferOperator.value
          : " ���� ���� �۱� ����ڴ� ���� �����Դϴ�."),
    ),
  );
  if (config.refundReviewer?.value === "����")
    reviewerPolicy.append(
      el("p", "Ȯ�� ����� �� " + date(config.refundReviewer.confirmedAt)),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "��ҡ���ǰ ���� �� ȯ�� ���� ����ڸ� ����� Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "ȯ�� ���� ����� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/operators/refund-reviewer", {
        revision: config.revision,
        value: "����",
        confirmed: true,
      });
      say("ȯ�� ���� �� ���� ����ڸ� ����� �����߽��ϴ�.");
      route();
    });
    reviewerPolicy.append(cf);
  }
  root.append(reviewerPolicy);
  const transferPolicy = card("� ����� �� ���� ȯ�� �۱� �� �Ϸ� ���");
  transferPolicy.append(
    el(
      "p",
      "���� ȯ�� �۱ݰ� OS �۱� �Ϸ� ��� ����ڴ� �����Դϴ�. ���찡 ȯ�� ���� �����������Ρ��ݾ��� Ȯ���ϰ� ���࿡�� ���� �۱��� �� OS�� ����մϴ�. OS�� �ڵ����� �۱����� �ʽ��ϴ�.",
    ),
  );
  if (config.refundTransferOperator?.value === "����")
    transferPolicy.append(
      el(
        "p",
        "Ȯ�� ����� �� " + date(config.refundTransferOperator.confirmedAt),
      ),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "���� ȯ�� �۱� �� �Ϸ� ��� ����ڸ� ����� Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "ȯ�� �۱� ����� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/operators/refund-transfer", {
        revision: config.revision,
        value: "����",
        confirmed: true,
      });
      say("���� ȯ�� �۱� �� �Ϸ� ��� ����ڸ� ����� �����߽��ϴ�.");
      route();
    });
    transferPolicy.append(cf);
  }
  root.append(transferPolicy);
  const recoveryPolicy = card("� ����� �� ���� ���� ���� Ȯ�� �� ��ũ �߱�");
  recoveryPolicy.append(
    el(
      "p",
      "���� ���� ����ڴ� �����Դϴ�. ���� OS ��� ����ó�� ������ Ȯ���ϰ� 30�� ��ȸ�� ��ũ�� �߱��մϴ�. ��� ����ڳ� ����ó�� �ٲ� ��� ���� ����ó Ȯ�ΰ� ����� ���� Ȯ���� ��ģ �� ó���մϴ�.",
    ),
  );
  if (config.recoveryOperator?.value === "����")
    recoveryPolicy.append(
      el("p", "Ȯ�� ����� �� " + date(config.recoveryOperator.confirmedAt)),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "���� ���� ���� Ȯ�� �� ��ũ �߱� ����ڸ� ����� Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "���� ���� ����� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/operators/recovery", {
        revision: config.revision,
        value: "����",
        confirmed: true,
      });
      say("���� ���� ����ڸ� ����� �����߽��ϴ�.");
      route();
    });
    recoveryPolicy.append(cf);
  }
  root.append(recoveryPolicy);
  const recipientPolicy = card("Ȯ�� � ���� �� ȯ�� ������� Ȯ��");
  recipientPolicy.append(
    el(
      "p",
      "ȯ�� ������´� ���Ա��� ���Ǹ� ��Ģ���� �ϰ� �ٸ� ���� ��û�� ���찡 ������ Ȯ���մϴ�. �۱� ���� Ȯ���ϰ�, ���� �۱� �Ϸ� ��Ͽ� ���� Ȯ�� ����� ���� �� ���� Ȯ�ι�ȣ�� ����ϴ�. ���� ��ü ��ȣ�� �� ȭ�鿡 �������� �ʽ��ϴ�.",
    ),
  );
  if (config.refundRecipient?.value === "original_payer_else_youngwoo_verified")
    recipientPolicy.append(
      el("p", "Ȯ�� ����� �� " + date(config.refundRecipient.confirmedAt)),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "���Ա��� ���� ��Ģ �� ���� �� ���� ���� Ȯ�� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "ȯ�� ������� ���� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/policies/refund-recipient", {
        revision: config.revision,
        value: "original_payer_else_youngwoo_verified",
        confirmed: true,
      });
      say("ȯ�� ������� Ȯ�� ������ �����߽��ϴ�.");
      route();
    });
    recipientPolicy.append(cf);
  }
  root.append(recipientPolicy);
  const timingPolicy = card("Ȯ�� � ���� �� ��ǰ �� ȯ�� �۱� ����");
  timingPolicy.append(
    el(
      "p",
      "������ Ȯ���� ȸ�����˼� Ȯ�� ������ �����մϴ�. ȯ�� ó�� ��ǥ�� �˼� �Ϸ����� �ƴ� ���� ��ȯ�Ϻ��� 3�����Ϸ� ����ϸ�, ���� �˼������� ������ �ڷ� �̷��� �ʽ��ϴ�. ��ҡ�ȯ�� ȭ�鿡�� ���� ��ȯ���� ����ϰ� �ڵ� ���� �������� Ȯ���ϼ���.",
    ),
  );
  if (
    config.returnRefundTiming?.value ===
    "within_3_business_days_after_inspection"
  )
    timingPolicy.append(
      el("p", "Ȯ�� ����� �� " + date(config.returnRefundTiming.confirmedAt)),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "��ǰ ȸ�����˼� �Ϸ� �� 3������ �̳� ȯ�� �۱� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "��ǰ ȯ�� �۱� ���� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/policies/return-refund-timing", {
        revision: config.revision,
        value: "within_3_business_days_after_inspection",
        confirmed: true,
      });
      say("��ǰ �� ȯ�� �۱� ������ 3������ �̳��� �����߽��ϴ�.");
      route();
    });
    timingPolicy.append(cf);
  }
  root.append(timingPolicy);
  const cancelTimingPolicy = card(
    "Ȯ�� � ���� �� ���� �� ��� ȯ�� �۱� ����",
  );
  cancelTimingPolicy.append(
    el(
      "p",
      "������ Ȯ���� �̼��ɡ�ȯ�� ���� Ȯ�� ������ �����մϴ�. ȯ�� ó�� ��ǥ�� �������� �ƴ� ���� ��ҡ�öȸ �����Ϻ��� 3�����Ϸ� ����ϸ�, ���� ���Ρ����� Ȯ�� ������ �ڷ� �̷��� �ʽ��ϴ�. ���ۡ����ְ� ���۵� ��ǰ�� ���Ǵ� ���� ������ �켱�Ͽ� ó���մϴ�.",
    ),
  );
  if (
    config.preReceiptRefundTiming?.value ===
    "within_3_business_days_after_approval_and_account"
  )
    cancelTimingPolicy.append(
      el(
        "p",
        "Ȯ�� ����� �� " + date(config.preReceiptRefundTiming.confirmedAt),
      ),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "���� �� ��� ���Ρ����� Ȯ�� �Ϸ� �� 3������ �̳� �۱� ������ Ȯ���߽��ϴ�.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "���� �� ��� �۱� ���� Ȯ�� ����", "button"));
    formTask(cf, async () => {
      await call("/admin/policies/pre-receipt-refund-timing", {
        revision: config.revision,
        value: "within_3_business_days_after_approval_and_account",
        confirmed: true,
      });
      say("���� �� ��� ȯ�� �۱� ������ 3������ �̳��� �����߽��ϴ�.");
      route();
    });
    cancelTimingPolicy.append(cf);
  }
  root.append(cancelTimingPolicy);
  const f = el("form");
  field(
    f,
    "registrationEnabled",
    "���� ��û ����",
    config.registrationEnabled,
    "checkbox",
  );
  field(
    f,
    "betaEnabled",
    "�������Ⱦ� ��û ����",
    config.betaEnabled,
    "checkbox",
  );
  field(
    f,
    "documentsConfirmed",
    "�ΰ��������� ��ġ��������������� � ������ Ȯ���߽��ϴ�.",
    config.documentsConfirmed,
    "checkbox",
  );
  f.append(el("button", "���� ���� ����", "button"));
  formTask(f, async (d) => {
    await call("/admin/config", {
      revision: config.revision,
      registrationEnabled: d.registrationEnabled === "on",
      betaEnabled: d.betaEnabled === "on",
      documentsConfirmed: d.documentsConfirmed === "on",
    });
    say("���� ������ �����߽��ϴ�.");
    route();
  });
  c.append(f);
  root.append(c);
  const { locations } = await call("/admin/locations");
  for (const l of locations) {
    const c = card(l.name),
      f = el("form");
    field(f, "address", "Ȯ�ε� ���� �ּ�", l.address);
    field(f, "hours", "� ���ϡ��ð� �� ���� ����", l.hours);
    field(f, "noticeUrl", "Ȯ���� ���� ���� �ּ�", l.noticeUrl, "url");
    field(f, "fee", "�⺻ �Ⱦ� ��� �� ����", 0, "number").readOnly = true;
    field(
      f,
      "sourceVerified",
      "���� ���������� ���� ���ǡ������ Ȯ���߽��ϴ�.",
      l.sourceVerified,
      "checkbox",
    );
    field(f, "enabled", "�� ����� ��û ����", l.enabled, "checkbox");
    f.append(el("button", "��� ���� ����", "button"));
    formTask(f, async (d) => {
      await call("/admin/locations", {
        ...d,
        id: l.id,
        revision: l.revision,
        fee: d.fee === "" ? null : Number(d.fee),
        enabled: d.enabled === "on",
        sourceVerified: d.sourceVerified === "on",
      });
      say("��� ������ �����߽��ϴ�.");
      route();
    });
    c.append(f);
    root.append(c);
  }
  const slot = card("���� ��й�ȣ ������ ���"),
    sf = el("form");
  field(sf, "id", "������ ID �� ����������");
  field(sf, "label", "������ ǥ�� �̸�");
  const label = el("label", "���"),
    select = el("select");
  select.name = "locationId";
  for (const l of locations) {
    const o = el("option", l.name);
    o.value = l.id;
    select.append(o);
  }
  label.append(select);
  sf.append(label);
  field(sf, "enabled", "������ ���", false, "checkbox");
  sf.append(el("button", "������ ���", "button"));
  formTask(sf, async (d) => {
    await call("/admin/slots", { ...d, enabled: d.enabled === "on" });
    say("�������� ����߽��ϴ�.");
    route();
  });
  slot.append(sf);
  root.append(slot);
}
function auth() {
  const c = card("OS ������ ����"),
    f = el("form");
  c.append(
    el(
      "p",
      "������� ��ũ�� OS���� �� ���� ȭ���� ���� �ּ���. �Ʒ� �α����� ���� ȯ�� �Ǵ� � ����ڿ��Դϴ�.",
    ),
  );
  field(f, "username", "������ ���̵�");
  field(f, "password", "��й�ȣ", "", "password");
  field(f, "otp", "���� �� �ڵ�").required = false;
  f.append(el("button", "�α���", "button"));
  formTask(f, async () => {
    await login(f);
    await load();
  });
  c.append(f);
  $("#view").append(c);
}
let routeRevision = 0;
async function route() {
  const revision = ++routeRevision,
    view = $("#view"),
    root = el("div");
  view.replaceChildren();
  if (!actor) {
    auth();
    return;
  }
  const name = location.hash.slice(1).split("?")[0] || "prices";
  document
    .querySelectorAll(".nav a")
    .forEach((a) =>
      a.setAttribute("aria-current", a.hash === "#" + name ? "page" : "false"),
    );
  try {
    if (name === "refunds") await adminRefunds(root, route);
    else if (name === "recovery") await adminRecovery(root, route);
    else if (name === "members") await members(root);
    else if (name === "quotes") await quotes(root);
    else if (name === "pickups") await pickups(root);
    else if (name === "settings") await settings(root);
    else await prices(root);
    if (revision === routeRevision) view.replaceChildren(...root.childNodes);
  } catch (e) {
    if (revision === routeRevision) say(e.message, true);
  }
}
async function load() {
  try {
    actor = (await call("/me")).member;
    if (actor.role !== "admin") throw Error("������ ������ �ʿ��մϴ�.");
    say("������ ���� �Ϸ� �� � ������ ��ǰ�ڷ�� �����˴ϴ�.");
  } catch (e) {
    actor = null;
    say(e.message, true);
  }
  route();
}
function requestOSConnection() {
  if (location.hash !== "#os-connect" || !window.opener) return false;
  ++routeRevision;
  $("#view").replaceChildren();
  say("OS ������ ������ Ȯ���ϰ� �ֽ��ϴ�.");
  window.opener.postMessage(
    { type: "WORKNIC_TRADE_READY" },
    "https://worknic.tools",
  );
  return true;
}
window.addEventListener("hashchange", () => {
  if (!requestOSConnection()) route();
});
window.addEventListener("message", async (e) => {
  if (e.origin !== "https://worknic.tools" || e.source !== window.opener)
    return;
  if (e.data?.type === "WORKNIC_OS_LOGOUT") {
    actor = null;
    $("#view").replaceChildren();
    await logout();
  }
  if (
    e.data?.type === "WORKNIC_OS_SESSION" &&
    typeof e.data.token === "string"
  ) {
    try {
      await call("/admin/os-connect", { token: e.data.token });
      history.replaceState(null, "", "/trade/admin#prices");
      await load();
    } catch (x) {
      say(x.message, true);
    }
  }
});
if (!requestOSConnection()) load();
