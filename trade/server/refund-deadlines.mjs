// Official 2026/2027 calendar and 2026 holiday amendments, checked 2026-11-09.
// Do not infer holidays outside verified coverage.
export const refundCalendar = {
  from: "2026-01-01",
  through: "2027-12-31",
  checkedOn: "2026-11-09",
  source: "https://www.kasi.re.kr/kor/post/newsMaterial/32031",
  amendmentSource:
    "https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431",
  officialAttachment:
    "https://www.korea.kr/common/download.do?fileId=198497802&tblKey=GMN",
  law: "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034118963",
  holidays: [
    "2026-01-01",
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-03-01",
    "2026-03-02",
    "2026-05-01",
    "2026-05-05",
    "2026-05-24",
    "2026-05-25",
    "2026-06-03",
    "2026-06-06",
    "2026-07-17",
    "2026-08-15",
    "2026-08-17",
    "2026-09-24",
    "2026-09-25",
    "2026-09-26",
    "2026-10-03",
    "2026-10-05",
    "2026-10-09",
    "2026-12-25",
    "2027-01-01",
    "2027-02-06",
    "2027-02-07",
    "2027-02-08",
    "2027-02-09",
    "2027-03-01",
    "2027-05-01",
    "2027-05-03",
    "2027-05-05",
    "2027-05-13",
    "2027-06-06",
    "2027-07-17",
    "2027-07-19",
    "2027-08-15",
    "2027-08-16",
    "2027-09-14",
    "2027-09-15",
    "2027-09-16",
    "2027-10-03",
    "2027-10-04",
    "2027-10-09",
    "2027-10-11",
    "2027-12-25",
    "2027-12-27",
  ],
};
export const kstDay = (at) =>
  new Date(at + 9 * 3600000).toISOString().slice(0, 10);
export function validDay(day) {
  return (
    typeof day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}
export function refundDue(triggerOn, now, calendar = refundCalendar) {
  if (!validDay(triggerOn)) return { status: "trigger_missing", dueOn: null };
  let cursor = Date.parse(triggerOn),
    businessDays = 0;
  const holidays = new Set(calendar.holidays);
  for (let i = 0; i < 45; i++) {
    cursor += 86400000;
    const day = new Date(cursor).toISOString().slice(0, 10);
    if (triggerOn < calendar.from || day > calendar.through)
      return {
        status: "calendar_unverified",
        triggerOn,
        dueOn: null,
        calendarThrough: calendar.through,
      };
    const weekday = new Date(cursor).getUTCDay();
    if (![0, 6].includes(weekday) && !holidays.has(day)) businessDays++;
    if (businessDays === 3)
      return {
        triggerOn,
        dueOn: day,
        deadlineExclusive: Date.parse(day + "T00:00:00+09:00") + 86400000,
        status:
          kstDay(now) > day
            ? "overdue"
            : kstDay(now) === day
              ? "due_today"
              : "pending",
        calendarThrough: calendar.through,
        calendarCheckedOn: calendar.checkedOn,
      };
  }
  return { status: "calendar_unverified", triggerOn, dueOn: null };
}
export function refundDeadline(record, now) {
  const returnRequired = ["collected", "shipped"].includes(
    record.originalStatus,
  );
  const triggerOn = returnRequired
    ? record.returnReceivedOn
    : record.withdrawalReceivedOn || kstDay(record.requestedAt);
  const result = {
    ...refundDue(triggerOn, record.completedAt || now),
    basis: returnRequired ? "goods_return_received" : "withdrawal_received",
    conservativeTarget: true,
  };
  if (["rejected", "completed"].includes(record.status))
    result.settlementStatus = record.status;
  return result;
}
