// Guided scenarios — the 18-claim prototype cases, told as journeys. Each one: a person, the prior claim(s)
// that already exist in the book, and THE claim you walk through the journey. `expect` tells the audience
// what should happen. Facilities are looked up by name in the Nepal dataset at load time.

const P = (insuree_id, name, dob, sex, national_id, district, province, hib, ssf, active = true) =>
  ({ insuree_id, name, dob, sex, national_id, district, province, hib_id: hib, ssf_id: ssf, hib_policy_active: active });

const L = (...codes) => codes.map(c => typeof c === 'string' ? { code: c, qty: 1 } : c);

export const SCENARIOS = [
  {
    id: 'clean', title: 'A clean outpatient visit', tagline: 'The happy path — nothing fires, the claim is paid.',
    expect: 'Engine 1 passes, our layer finds nothing to compare it with, the claim goes straight to valuation and payment.',
    person: P('SCN-01', 'Prakash Oli', '1991-12-01', 'M', 'NID-1991000688', 'Kathmandu', 'Bagmati', 'HIB910006881', null),
    priors: [],
    claim: { scheme: 'HIB', facility: 'Kathmandu PHCC-1', diagnosis: 'J06', care_type: 'O', date_from: '2026-07-24', lines: L('CONS-OPD', 'LAB-CBC') },
  },
  {
    id: 'within_dup', title: 'Within-scheme exact duplicate', tagline: 'The same consultation billed twice under a new claim code.',
    expect: 'Engine 1 passes it (there is no duplicate rule). Our R1 matches the earlier claim: same person, scheme, date and service → flagged, high.',
    person: P('SCN-02', 'Gita Rai', '1992-03-11', 'F', 'NID-1992000450', 'Kathmandu', 'Bagmati', 'HIB920004501', null),
    priors: [{ scheme: 'HIB', facility: 'Kathmandu PHCC-1', diagnosis: 'J06', care_type: 'O', date_from: '2026-07-01', lines: L('CONS-OPD', 'LAB-CBC') }],
    claim: { scheme: 'HIB', facility: 'Kathmandu PHCC-1', diagnosis: 'J06', care_type: 'O', date_from: '2026-07-01', lines: L('CONS-OPD') },
    truth: 'within_dup',
  },
  {
    id: 'cross_scheme', title: 'Cross-scheme duplicate (HIB → SSF)', tagline: 'One appendectomy, reimbursed by both schemes.',
    expect: 'HIB paid the surgery at Bir Hospital. The same person is an SSF contributor and claims it again at TUTH. Neither system sees the other — our R3 joins them on the National ID. R4 also fires (two admissions at once).',
    person: P('SCN-03', 'Sita Sharma', '1990-01-02', 'F', 'NID-1990000001', 'Kathmandu', 'Bagmati', 'HIB900000011', 'SSF400012345'),
    priors: [{ scheme: 'HIB', facility: 'Bir Hospital', diagnosis: 'K35', care_type: 'I', date_from: '2026-07-05', date_to: '2026-07-08', lines: L('SURG-APPENDECTOMY', 'LAB-CBC', 'DRUGS-IPD', { code: 'WARD-DAY', qty: 3 }) }],
    claim: { scheme: 'SSF', facility: 'Tribhuvan University Teaching Hospital', diagnosis: 'K35', care_type: 'I', date_from: '2026-07-06', date_to: '2026-07-09', lines: L('SURG-APPENDECTOMY', { code: 'WARD-DAY', qty: 3 }) },
    truth: 'cross_scheme',
  },
  {
    id: 'cross_composite', title: 'Cross-scheme, no National ID', tagline: 'Caught anyway — by name, date of birth and sex.',
    expect: 'This patient has no National ID. Identity resolution falls back to the composite key; the two records still join because the name is spelt the same in both schemes → R3 fires.',
    person: P('SCN-04', 'Ram Thapa', '1985-02-10', 'M', null, 'Lalitpur', 'Bagmati', 'HIB850210777', 'SSF400098765'),
    priors: [{ scheme: 'HIB', facility: 'Patan Hospital', diagnosis: 'E11', care_type: 'O', date_from: '2026-07-15', lines: L('CONS-OPD', 'LAB-HBA1C') }],
    claim: { scheme: 'SSF', facility: 'Civil Service Hospital', diagnosis: 'E11', care_type: 'O', date_from: '2026-07-15', lines: L('CONS-OPD', 'LAB-HBA1C') },
    truth: 'cross_scheme',
  },
  {
    id: 'cross_hard', title: 'Cross-scheme, no National ID, name spelt differently', tagline: 'The one we MISS — and why it matters.',
    expect: 'No National ID, and SSF recorded him as "K. Bahadur" while HIB has "Krishna Bahadur". The composite key cannot join them → nothing fires. This is the identity-resolution ceiling and the case for National-ID linkage.',
    person: P('SCN-05', 'Krishna Bahadur', '1975-05-05', 'M', null, 'Chitwan', 'Bagmati', 'HIB750505001', 'SSF400055555'),
    priors: [{ scheme: 'HIB', facility: 'Bharatpur Hospital', diagnosis: 'E11', care_type: 'O', date_from: '2026-07-26', lines: L('CONS-OPD', 'LAB-HBA1C') }],
    claim: { scheme: 'SSF', facility: 'Bharatpur Hospital', diagnosis: 'E11', care_type: 'O', date_from: '2026-07-26', lines: L('CONS-OPD', 'LAB-HBA1C'), name_override: 'K. Bahadur' },
    truth: 'cross_scheme', hard: true,
  },
  {
    id: 'overlap', title: 'Impossible overlap', tagline: 'Admitted in Pokhara and Kathmandu at the same time.',
    expect: 'Two inpatient stays whose dates overlap at different hospitals. Engine 1 sees each claim alone and passes both; our R4 sees the pair.',
    person: P('SCN-06', 'Hari K.C.', '1979-08-20', 'M', 'NID-1979000777', 'Kaski', 'Gandaki', 'HIB790820777', null),
    priors: [{ scheme: 'HIB', facility: 'Pokhara Academy of Health Sciences', diagnosis: 'I50', care_type: 'I', date_from: '2026-07-10', date_to: '2026-07-14', lines: L({ code: 'ICU-DAY', qty: 2 }, { code: 'WARD-DAY', qty: 2 }, 'ECHO') }],
    claim: { scheme: 'HIB', facility: 'Bir Hospital', diagnosis: 'S72', care_type: 'I', date_from: '2026-07-12', date_to: '2026-07-15', lines: L('SURG-ORIF', { code: 'WARD-DAY', qty: 3 }) },
    truth: 'impossible_overlap',
  },
  {
    id: 'resubmission', title: 'Resubmission gaming', tagline: 'Rejected on Monday, back on Thursday with a swapped code.',
    expect: 'The first claim (an unpriced MRI) is rejected by Engine 1 — correctly. Three days later the same person, same diagnosis, comes back with a priced code. Engine 1 now passes it; our R5 remembers the rejection.',
    person: P('SCN-07', 'Bina Gurung', '1996-11-05', 'F', 'NID-1996000231', 'Kathmandu', 'Bagmati', 'HIB961105231', null),
    priors: [{ scheme: 'HIB', facility: 'Kathmandu PHCC-1', diagnosis: 'M54', care_type: 'O', date_from: '2026-07-02', lines: L('MRI-SPINE') }],
    claim: { scheme: 'HIB', facility: 'Kathmandu PHCC-1', diagnosis: 'M54', care_type: 'O', date_from: '2026-07-05', lines: L('MRI-LUMBAR') },
    truth: 'resubmission',
  },
  {
    id: 'upcode', title: 'Off-protocol upcode', tagline: 'An appendectomy billed under a common cold.',
    expect: 'Every line is priced and covered, so Engine 1 passes it — it never looks at the diagnosis (reason 8 is disabled). Our STG rule checks the lines against the standard treatment protocol for J06.',
    person: P('SCN-08', 'Kumar Lama', '1970-06-30', 'M', 'NID-1970000500', 'Kathmandu', 'Bagmati', 'HIB700630500', null),
    priors: [],
    claim: { scheme: 'HIB', facility: 'Bir Hospital', diagnosis: 'J06', care_type: 'I', date_from: '2026-07-20', date_to: '2026-07-21', lines: L('WARD-DAY', 'SURG-APPENDECTOMY') },
    truth: 'stg_upcode',
  },
  {
    id: 'legit_split', title: 'An honest split visit (false positive)', tagline: 'Why the layer never auto-rejects.',
    expect: 'A genuine check-up whose lab line was entered as a second claim. R2 flags it as a possible split episode — the reviewer sees both, clears it in seconds, and the feedback lowers R2\'s weight.',
    person: P('SCN-09', 'Sunita Karki', '1994-07-07', 'F', 'NID-1994000321', 'Kathmandu', 'Bagmati', 'HIB940707321', null),
    priors: [{ scheme: 'HIB', facility: 'Kathmandu PHCC-1', diagnosis: 'Z00', care_type: 'O', date_from: '2026-07-25', lines: L('CONS-OPD') }],
    claim: { scheme: 'HIB', facility: 'Kathmandu PHCC-1', diagnosis: 'Z00', care_type: 'O', date_from: '2026-07-25', lines: L('LAB-CBC') },
    truth: 'legitimate',
  },
  {
    id: 'lapsed', title: 'Lapsed policy (the existing engine\'s job)', tagline: 'Not fraud — an eligibility failure caught today.',
    expect: 'The HIB policy has lapsed. Engine 1 rejects with reason 21 NO_COVERAGE before our layer ever sees it. The existing engine does its job; ours only adds what it cannot do.',
    person: P('SCN-10', 'Maya Tamang', '1988-09-14', 'F', 'NID-1988000044', 'Kathmandu', 'Bagmati', 'HIB880914044', null, false),
    priors: [],
    claim: { scheme: 'HIB', facility: 'Kathmandu PHCC-1', diagnosis: 'J06', care_type: 'O', date_from: '2026-07-22', lines: L('CONS-OPD') },
    truth: 'legitimate',
  },
];
