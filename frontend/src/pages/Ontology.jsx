import { Link } from 'react-router-dom';

/* Ontology — explained simply. Three questions, in order:
   1. what is the ontology?  2. which coding standards does a Nepali claim actually use?  3. which gaps does it close?
   Content grounded in Week 3-4/ontology and the adjudication report; sources at the foot. */

const Tag = ({ k }) => <span className={`std-tag ${k}`}>{k === 'used' ? 'in use' : k === 'partial' ? 'partly' : 'not used'}</span>;

/* one row per thing that appears on a claim */
const ON_A_CLAIM = [
  ['The diagnosis', 'ICD-10 (WHO) · ICD-11 is the successor', ['used', 'ICD-10, up to five codes per claim — but openIMIS never validates it (reason 8 is switched off)'], ['used', 'ICD-10 for the HMIS report and the claim; recorders trained on ICD-11 since 2021'], 'Diagnosis · icdCode', 'pulmonary tuberculosis: ICD-10 A15.0 · ICD-11 1B10.0; acute appendicitis: K35 · DB10; type 2 diabetes: E11 · 5A11'],
  ['The treatment (services, procedures)', 'ICHI (WHO) · SNOMED CT', ['no', 'local price-list codes, e.g. CONS-OPD, SURG-APPENDECTOMY'], ['no', 'hospital tariff codes, mapped to the price list when the claim is entered'], 'Service · itemCode', 'appendectomy: SNOMED CT 80146002; ICHI codes it as target · action · means (appendix · excision · open approach); our price list: SURG-APPENDECTOMY'],
  ['Medicines', 'ATC / DDD (WHO)', ['partial', 'price-list items; the National List of Essential Medicines 2021 is the reference'], ['partial', 'brand or generic names; NLEM for free medicines'], 'MedicalItem', 'rifampicin J04AB02, isoniazid J04AC01, the fixed-dose combination J04AM02; metformin A10BA02; NLEM lists them under anti-tuberculosis and antidiabetic medicines'],
  ['Laboratory tests', 'LOINC', ['no', 'local codes, e.g. LAB-CBC'], ['no', 'local test names'], 'Service', 'sputum acid-fast smear 11545-1; complete blood count 58410-2; HbA1c 4548-4; creatinine 2160-0 — our price list only has LAB-CBC, LAB-HBA1C, LAB-RFT'],
  ['The patient', 'National ID (Government of Nepal)', ['partial', 'HIB member number (CHFID) or SSF contributor number — each scheme its own; the National ID is recorded only for some'], ['partial', 'hospital registration number; the card of the scheme'], 'Beneficiary → Membership → Scheme · IdentityKey', 'synthetic formats: NID-1990000001 · HIB900000011 (CHFID) · SSF400012345 — the same person, three numbers'],
  ['The doctor', 'Nepal Medical Council (NMC) registration', ['used', 'NMC number on the prescription; a missing number is a top rejection cause'], ['used', 'NMC number on prescriptions'], 'Practitioner · nmcNumber', 'NMC-24700 (synthetic); stored by HIB in Claim.guaranteeId'],
  ['The place', 'ISO 3166-2:NP provinces', ['partial', 'openIMIS location tree: region → district → municipality → ward'], ['used', 'the same tree in the HMIS'], 'Province … Ward', 'Bagmati = NP-P3, Lumbini = NP-P5; below it Kathmandu district → municipality → ward'],
  ['The claim itself', 'HL7 FHIR R4 Claim', ['used', 'EMRs send FHIR claims to openIMIS (about 70 % of HIB hospitals); SSF exchanges data with openIMIS over FHIR'], ['used', 'the EMR sends a FHIR Claim, or staff key it in'], 'Claim ≡ fhir:Claim', 'Claim.diagnosis[0].diagnosisCodeableConcept.coding = {system: http://hl7.org/fhir/sid/icd-10, code: A15.0}; Claim.patient → Patient.identifier (NID); Claim.provider → Organization (HF0001)'],
  ['The claim number', '—', ['used', 'Bikram-Sambat fiscal-year code, e.g. 2083-084-000123 — unique inside one scheme only'], ['—', 'the hospital\'s own invoice number'], 'claimCode', '2083-084-000123 = fiscal year 2083/84 BS (2026/27 AD), sequence 123; SSF-2083-084-000123 at SSF'],
  ['What happens to it', 'openIMIS statuses and rejection reasons', ['used', 'Entered → Checked → Processed → Valuated / Rejected; reasons 1–21, with 6 = "Item/Service duplicated"'], ['—', 'notified of rejection and resubmits'], 'ClaimStatus · RejectionReason', 'status 4 = Checked; review status 4 = Selected; rejection 6 = Item/Service duplicated, 21 = no coverage'],
  ['Routine reporting', 'DHIS2 (national HMIS)', ['used', 'separate from claims'], ['used', 'monthly report to the HMIS'], '—', 'HMIS data element "TB cases notified" reported monthly per facility; a claim never reaches DHIS2'],
  ['Payment grouping', 'DRG / case-mix', ['no', 'fee-for-service and package rates with a family ceiling (NPR 100,000)'], ['no', 'itemised bills'], '—', 'MS-DRG 343 = appendectomy without complications (US); Nepal has no DRG — the price list plays that role'],
];

const GAPS = [
  ['The same person in two schemes', 'HIB and SSF each know their own member number; nothing joins them.', 'The ontology has one Beneficiary with several Memberships, and an IdentityKey: National ID first, else name + date of birth + sex. Rule R3 uses it.'],
  ['The diagnosis is never checked against the treatment', 'openIMIS switched reason 8 off; there is no protocol in the system.', 'TreatmentProtocol per diagnosis (what is allowed, typical length of stay), elicited from the HIB expert. The STG rule uses it.'],
  ['No duplicate check at all', 'Reason 6 is commented out in openIMIS; the frequency edit compares nothing by default.', 'Rules R1–R5 compare a claim with the person\'s history across facilities and schemes.'],
  ['Rules live in people\'s heads', 'Reviewers apply their own logic; nothing records why a claim was flagged.', 'Every rule is an object with a condition, a because, a weight, the fraud type and red flag it uses, and where it came from.'],
  ['Four names for one field', 'Legacy database columns, Django fields, GraphQL fields and FHIR elements all differ.', 'FHIR names are the canonical ones; a crosswalk maps the rest (03_naming_standards).'],
];

/* The ontology's own facts, so the competency questions below are answered from data, not prose. */
const RULES_TERMS = {
  R1: { uses: ['Claim', 'Membership', 'Scheme', 'ClaimLine'], detects: 'ftDuplicateClaim', flag: 'rfSameServiceSameDay' },
  R2: { uses: ['Claim', 'HealthFacility', 'Beneficiary'], detects: 'ftUnbundling', flag: 'rfSameEpisodeSplit' },
  R3: { uses: ['Claim', 'IdentityKey', 'Scheme', 'Diagnosis'], detects: 'ftCrossSchemeDoubleClaim', flag: 'rfSamePersonTwoPayers' },
  R4: { uses: ['Claim', 'HealthFacility'], detects: 'ftImpossibleClinicalSequence', flag: 'rfImpossibleSequence' },
  R5: { uses: ['Claim', 'RejectionReason', 'Diagnosis'], detects: 'ftResubmissionGaming', flag: 'rfRejectedThenReentered' },
  STG: { uses: ['Claim', 'Diagnosis', 'TreatmentProtocol', 'ClaimLine'], detects: 'ftUpcoding · ftUnnecessaryServices · ftInflatedBillsExtendedStay', flag: 'rfDiagnosisTreatmentMismatch' },
  R6: { uses: ['Claim', 'HealthFacility', 'DetectionFlag'], detects: 'ftPhantomHospitalisation · ftCollusionKickbacks', flag: 'rfFacilityFlagRateAboveDoctors' },
  R7: { uses: ['Claim', 'Practitioner', 'HealthFacility'], detects: 'ftPhantomHospitalisation · ftDutyHourBilling', flag: 'rfSameProviderManyFacilities' },
  R8: { uses: ['Claim', 'ClaimLine', 'Diagnosis', 'TreatmentProtocol'], detects: 'ftUnnecessaryServices · ftInflatedBillsExtendedStay', flag: 'rfServiceFrequencyAnomaly' },
};
const FRAUD_TYPES = ['ftDuplicateClaim', 'ftCrossSchemeDoubleClaim', 'ftUnbundling', 'ftUpcoding', 'ftPhantomHospitalisation', 'ftForgedDocuments', 'ftInflatedBillsExtendedStay', 'ftUnnecessaryServices', 'ftImpersonation', 'ftNonDisclosure', 'ftCollusionKickbacks', 'ftClaimsForDeceased', 'ftImpossibleClinicalSequence', 'ftResubmissionGaming', 'ftDutyHourBilling', 'ftStagedRescue'];
const RED_FLAGS = ['rfSameServiceSameDay', 'rfSameEpisodeSplit', 'rfSamePersonTwoPayers', 'rfImpossibleSequence', 'rfRejectedThenReentered', 'rfDiagnosisTreatmentMismatch', 'rfMissingNmcNumber', 'rfSameProviderManyFacilities', 'rfServiceAfterDeath', 'rfServiceFrequencyAnomaly', 'rfFacilityFlagRateAboveDoctors'];
const covered = new Set(Object.values(RULES_TERMS).flatMap(r => r.detects.split(' · ')));
const flagsUsed = new Set(Object.values(RULES_TERMS).map(r => r.flag));
const CQ = [
  ['Which rules depend on the IdentityKey (and therefore on National-ID coverage)?', Object.entries(RULES_TERMS).filter(([, r]) => r.uses.includes('IdentityKey')).map(([k]) => k).join(', ') + ' — every history rule reads the claim history through the identity index, but only R3 joins across schemes; R6 and R7 need no identity at all'],
  ['Which fraud types in the typology have a rule?', [...covered].join(', ')],
  ['Which fraud types have no rule at all?', FRAUD_TYPES.filter(f => !covered.has(f)).join(', ') + ` (${FRAUD_TYPES.filter(f => !covered.has(f)).length} of ${FRAUD_TYPES.length})`],
  ['Which red flags are known but unused by any rule?', RED_FLAGS.filter(f => !flagsUsed.has(f)).join(', ')],
  ['Which classes does the STG rule need that openIMIS does not have?', 'TreatmentProtocol (elicited) — Diagnosis and ClaimLine exist in openIMIS but are never compared'],
  ['What does a reviewer decision change?', 'the Claim\'s ReviewDecision and RejectionReason (6 on confirm), and the weight of every DetectionRule that fired — recorded with provenance'],
];
const GLOSSARY = [
  ['HIB', 'Health Insurance Board — Nepal\'s national social health insurance scheme (family policies, live since 2016)'],
  ['SSF', 'Social Security Fund — contribution-based scheme for formal-sector workers; uses the openIMIS claims module over its SoSys core'],
  ['openIMIS', 'the open-source insurance management system both schemes run, each in its own instance'],
  ['CHFID', 'the HIB member number printed on the card (from a pre-minted pool); scheme-local'],
  ['National ID', 'Government of Nepal identifier; recorded for only part of the members; the only cross-scheme key'],
  ['NMC number', 'Nepal Medical Council registration of the treating doctor; HIB stores it on the claim and rejects prescriptions without it'],
  ['Bikram Sambat', 'Nepal\'s official calendar; claim codes carry the fiscal year, e.g. 2083-084'],
  ['Medical Officer', 'the clinician-reviewer at HIB or SSF who decides on a sampled or flagged claim'],
  ['Claim vault', 'SSF\'s holding area for claims sharing hospital + contributor + visit date, pending review'],
  ['Standard treatment protocol', 'the national guideline of what a diagnosis warrants; the basis of the STG rule'],
  ['Reason 6', 'the openIMIS rejection reason "Item/Service duplicated" — present in the reviewer UI, disabled in the code'],
];

const SOURCES = [
  ['openIMIS — Nepal / Health Insurance', 'https://openimis.org/nepal-health-insurance'],
  ['openIMIS wiki — Social Security Fund Nepal', 'https://openimis.atlassian.net/wiki/spaces/OP/pages/3590750368/Social+Security+Fund+Nepal'],
  ['openIMIS FHIR R4 Implementation Guide', 'https://fhir.openimis.org/'],
  ['WHO Nepal — medical recorders trained on ICD-11 (Dec 2021)', 'https://www.who.int/nepal/news/detail/15-12-2021-health-professionals-and-medical-recorders-trained-on-international-classification-of-disease-11th-revision-(icd-11)'],
  ['MoHP Digital Health — the transition from ICD-10 to ICD-11', 'https://digitalhealth.mohp.gov.np/embracing-the-transition-moving-from-icd-10-to-icd-11/'],
  ['DoHS HMIS portal (DHIS2)', 'https://hmis.gov.np/'],
  ['National List of Essential Medicines Nepal 2021', 'https://scorecard.prb.org/wp-content/uploads/2022/03/National-List-of-Essential-Medicines-Nepal-2021.pdf'],
  ['Project files: Week 3-4/ontology (claim_adjudication.ttl, 01–03 .md) and the adjudication report', ''],
];

export default function Ontology() {
  return <div className="page plain">
    <div className="center">
      <div className="eyebrow">Reference</div>
      <h1 style={{ fontSize: '1.7rem', marginTop: '.3rem' }}>Ontology</h1>
      <p className="lead">An ontology is a shared vocabulary: the things a claim talks about, what each one means, and how they connect. Ours is called <b>HIC</b> (health-insurance claim). It reuses the codes Nepal already uses and adds only what is missing.</p>
    </div>

    <h2>1 · What it looks like</h2>
    <div className="card" style={{ padding: '.6rem' }}><img src={import.meta.env.BASE_URL + "ontology_core.png"} alt="HIC ontology core" style={{ width: '100%', display: 'block', borderRadius: 8 }} /></div>
    <div className="tri mt">
      <div className="card"><b>A person, not a member number</b><span className="small">One Beneficiary can hold an HIB membership and an SSF membership. openIMIS has no such idea — each scheme sees only its own number. This is the whole reason cross-scheme duplicates go unseen.</span></div>
      <div className="card"><b>Rules are things, not code</b><span className="small">Each rule (R1–R8, STG) has a condition, a plain-language <i>because</i>, a weight, the fraud type it detects, the red flag it looks for, and its source. That is what makes every flag explainable.</span></div>
      <div className="card"><b>Everything else is borrowed</b><span className="small">FHIR resource names, ICD-10 codes, openIMIS statuses and rejection reasons, the World Bank / NHCAA fraud typology. 44 classes, 62 properties, every term labelled and defined, written in OWL 2 / Turtle.</span></div>
    </div>

    <h2>2 · Which codes a Nepali claim actually uses <small>by what is on the claim</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="std-table"><thead><tr><th>On the claim</th><th>International standard</th><th>HIB and SSF today</th><th>Nepali hospitals today</th><th>In our ontology</th><th>Example</th></tr></thead>
        <tbody>{ON_A_CLAIM.map(([what, intl, [s1, t1], [s2, t2], ours, ex]) => <tr key={what}>
          <td>{what}</td><td className="small">{intl}</td>
          <td className="small">{s1 !== '—' && <Tag k={s1} />}{t1}</td>
          <td className="small">{s2 !== '—' && <Tag k={s2} />}{t2}</td>
          <td className="mono small">{ours}</td>
          <td className="small" style={{ minWidth: '14rem' }}>{ex}</td>
        </tr>)}</tbody></table>
    </div>
    <div className="card teal mt">
      <b className="navy">One patient, every code system.</b> <span className="small">A 34-year-old man with cough and weight loss at a district hospital: the doctor (<span className="mono">NMC-24700</span>) records <b>pulmonary tuberculosis</b> as ICD-10 <span className="mono">A15.0</span> (ICD-11 <span className="mono">1B10.0</span>; SNOMED CT <span className="mono">154283005</span>); the lab reports a sputum acid-fast smear (LOINC <span className="mono">11545-1</span>) and a chest X-ray; the prescription is a rifampicin–isoniazid combination (ATC <span className="mono">J04AM02</span>, NLEM anti-tuberculosis section). The claim to HIB carries the local codes <span className="mono">CONS-OPD, LAB-CBC, XRAY</span>, the member number <span className="mono">HIB900000011</span> and the code <span className="mono">2083-084-000123</span>, leaves as a FHIR Claim, and lands in openIMIS as Entered (2). The medicines themselves are supplied free by the National Tuberculosis Programme, so they do not appear on the claim at all — one reason a diagnosis-treatment protocol has to be scheme-specific. The same visit reaches DHIS2 only as one unit in the monthly "TB cases notified" data element.</span>
    </div>
    <p className="std-note mt">Reading the table: the diagnosis, the doctor and the exchange format follow international standards; the treatment, the tests and the medicines do not, and the patient has no identifier both schemes share. Hospital practice varies; the rows describe the common pattern documented by openIMIS, MoHP and WHO Nepal.</p>

    <h2>3 · The gaps it closes</h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="std-table"><thead><tr><th>Gap</th><th>Today</th><th>In the ontology</th></tr></thead>
        <tbody>{GAPS.map(([g, t, o]) => <tr key={g}><td>{g}</td><td className="small">{t}</td><td className="small">{o}</td></tr>)}</tbody></table>
    </div>
    <p className="small mt">The rules themselves, with their thresholds and live counts, are on the <Link to="/rules">Rules page</Link>.</p>

    <h2>4 · Competency questions <small>answered from the ontology's own terms, not from prose</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="std-table"><thead><tr><th>Question</th><th>Answer</th></tr></thead>
        <tbody>{CQ.map(([q, a]) => <tr key={q}><td style={{ whiteSpace: 'normal' }}>{q}</td><td className="small mono" style={{ whiteSpace: 'normal' }}>{a}</td></tr>)}</tbody></table>
    </div>
    <p className="std-note mt">The full ontology (697 triples) is <a href={import.meta.env.BASE_URL + 'claim_adjudication.ttl'} target="_blank" rel="noreferrer">claim_adjudication.ttl</a>; the same questions run as SPARQL against it in <span className="mono">Week 3-4/ontology</span>.</p>

    <h2>5 · Glossary <small>for readers outside Nepal</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="std-table"><tbody>{GLOSSARY.map(([t, d]) => <tr key={t}><td>{t}</td><td className="small">{d}</td></tr>)}</tbody></table>
    </div>

    <details className="mt"><summary className="small mute" style={{ cursor: 'pointer' }}>Sources</summary>
      <ol className="small mute" style={{ margin: '.3rem 0 0 1.1rem', padding: 0 }}>{SOURCES.map(([t, u]) => <li key={t}>{u ? <a href={u} target="_blank" rel="noreferrer">{t}</a> : t}</li>)}</ol>
    </details>
  </div>;
}
