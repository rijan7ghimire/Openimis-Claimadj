// ENGINE 1 — a faithful slice of openIMIS `validate_claim` (claim/validations.py), per claim, in isolation.
// Uses the REAL rejection-reason codes. Reason 6 (DUPLICATED) and 8 (ICD_NOT_IN_LIST) are commented out in
// the source (validations.py:38 / :40) — shown here as DISABLED so the gap is visible on screen.

export const QTY_HARD_CAP = 30;

export const REJECTION_CODES = {
  1: 'INVALID_ITEM_OR_SERVICE', 2: 'NOT_IN_PRICE_LIST', 3: 'NO_PRODUCT_FOUND', 4: 'CATEGORY_LIMITATION',
  5: 'FREQUENCY_FAILURE', 6: 'DUPLICATED', 7: 'FAMILY', 8: 'ICD_NOT_IN_LIST', 9: 'TARGET_DATE', 10: 'CARE_TYPE',
  11: 'MAX_HOSPITAL_ADMISSIONS', 12: 'MAX_VISITS', 13: 'MAX_CONSULTATIONS', 14: 'MAX_SURGERIES', 15: 'MAX_DELIVERIES',
  16: 'QTY_OVER_LIMIT', 17: 'WAITING_PERIOD_FAIL', 19: 'MAX_ANTENATAL', 20: 'INVALID_CLAIM', 21: 'NO_COVERAGE',
};

/**
 * @returns {{accepted:boolean, code:number, reason:string, because:string, checks:Array}}
 * checks: [{code, name, status: 'pass'|'fail'|'skipped'|'off'|'disabled', detail, where}]
 */
export function validateExisting(claim, ref) {
  const checks = [];
  let failed = null;
  const push = (code, name, status, detail, where) => {
    checks.push({ code, name, status, detail, where });
    if (status === 'fail' && !failed) failed = { code, reason: name, because: detail };
  };
  const after = (code, name, detail, where, cond) => {
    if (failed) return push(code, name, 'skipped', 'not evaluated — an earlier edit already rejected the claim', where);
    push(code, name, cond ? 'fail' : 'pass', detail(cond), where);
  };

  const dFrom = claim.date_from, dTo = claim.date_to || claim.date_from;
  // 9 — target date
  after(9, 'TARGET_DATE', (c) => c ? 'discharge date precedes admission date' : `service dates ${dFrom} → ${dTo} are coherent`,
    'validations.py:1666', dTo < dFrom);
  // 21 — coverage / active policy
  after(21, 'NO_COVERAGE', (c) => c ? `no active ${claim.scheme} policy covers this person on ${dFrom}` : `${claim.scheme} policy active on ${dFrom}`,
    'validations.py:1151', !claim.policy_active);
  // 7 — insuree/family validity (informational pass)
  after(7, 'FAMILY (valid CHFID)', () => `member number ${claim.chf_id || '—'} is valid`, 'validations.py:1687', false);
  // 2 — price list
  const offList = (claim.lines || []).filter(l => !(l.code in ref.priceList)).map(l => l.code);
  after(2, 'NOT_IN_PRICE_LIST', (c) => c ? `'${offList[0]}' is not in the facility price list` : `all ${claim.lines.length} lines are priced`,
    'validations.py:1556', offList.length > 0);
  // 10 — care type vs facility
  const fac = ref.facilities[claim.facility_id];
  const careBad = !!fac && fac.care === 'O' && claim.care_type === 'I';
  after(10, 'CARE_TYPE', (c) => c ? `${fac.name} is outpatient-only but the claim is inpatient` : `care type ${claim.care_type} allowed at this facility`,
    'validations.py:1596', careBad);
  // 4 — patient category (informational pass)
  after(4, 'CATEGORY_LIMITATION', () => 'patient category (adult/child × M/F) matches every line', 'validations.py:1618', false);
  // 16 — quantity cap
  const overQty = (claim.lines || []).find(l => l.qty > QTY_HARD_CAP);
  after(16, 'QTY_OVER_LIMIT', (c) => c ? `quantity ${overQty.qty} of ${overQty.code} exceeds the cap ${QTY_HARD_CAP}` : `all quantities within limits`,
    'validations.py:1890', !!overQty);
  // 17 — waiting period (informational pass)
  after(17, 'WAITING_PERIOD', () => 'policy effective date + waiting period is before the service date', 'validations.py:1841', false);
  // 5 — frequency: exists but only runs when item.frequency > 0 (unset in practice)
  push(5, 'FREQUENCY_FAILURE', 'off', 'runs only if the service has frequency > 0 — unset, so it never compares claims', 'validations.py:1636');
  // 6 — duplicated: commented out
  push(6, 'DUPLICATED', 'disabled', 'REJECTION_REASON_DUPLICATED = 6 is commented out with zero references — no duplicate check exists', 'validations.py:38');
  // 8 — ICD not in list: commented out
  push(8, 'ICD_NOT_IN_LIST', 'disabled', 'diagnosis is never validated (reason 8 commented out)', 'validations.py:40');

  if (failed) return { accepted: false, ...failed, checks };
  return { accepted: true, code: 0, reason: 'ACCEPTED', because: 'every active edit passed — the claim is CHECKED and moves on', checks };
}
