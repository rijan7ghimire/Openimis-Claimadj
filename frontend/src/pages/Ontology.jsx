import { Link } from 'react-router-dom';

/* Ontology — explained simply. Three questions, in order:
   1. what is the ontology?  2. which coding standards does a Nepali claim actually use?  3. which gaps does it close?
   Content grounded in Week 3-4/ontology and the adjudication report; sources at the foot. */

const Tag = ({ k }) => <span className={`std-tag ${k}`}>{k === 'used' ? 'in use' : k === 'partial' ? 'partly' : 'not used'}</span>;

/* one row per thing that appears on a claim */
const ON_A_CLAIM = [
  ['The diagnosis', 'ICD-10 (WHO) · ICD-11 is the successor', ['used', 'ICD-10, up to five codes per claim — but openIMIS never validates it (reason 8 is switched off)'], ['used', 'ICD-10 for the HMIS report and the claim; recorders trained on ICD-11 since 2021'], 'Diagnosis · icdCode'],
  ['The treatment (services, procedures)', 'ICHI (WHO) · SNOMED CT', ['no', 'local price-list codes, e.g. CONS-OPD, SURG-APPENDECTOMY'], ['no', 'hospital tariff codes, mapped to the price list when the claim is entered'], 'Service · itemCode'],
  ['Medicines', 'ATC / DDD (WHO)', ['partial', 'price-list items; the National List of Essential Medicines 2021 is the reference'], ['partial', 'brand or generic names; NLEM for free medicines'], 'MedicalItem'],
  ['Laboratory tests', 'LOINC', ['no', 'local codes, e.g. LAB-CBC'], ['no', 'local test names'], 'Service'],
  ['The patient', 'National ID (Government of Nepal)', ['partial', 'HIB member number (CHFID) or SSF contributor number — each scheme its own; the National ID is recorded only for some'], ['partial', 'hospital registration number; the card of the scheme'], 'Beneficiary → Membership → Scheme · IdentityKey'],
  ['The doctor', 'Nepal Medical Council (NMC) registration', ['used', 'NMC number on the prescription; a missing number is a top rejection cause'], ['used', 'NMC number on prescriptions'], 'Practitioner · nmcNumber'],
  ['The place', 'ISO 3166-2:NP provinces', ['partial', 'openIMIS location tree: region → district → municipality → ward'], ['used', 'the same tree in the HMIS'], 'Province … Ward'],
  ['The claim itself', 'HL7 FHIR R4 Claim', ['used', 'EMRs send FHIR claims to openIMIS (about 70 % of HIB hospitals); SSF exchanges data with openIMIS over FHIR'], ['used', 'the EMR sends a FHIR Claim, or staff key it in'], 'Claim ≡ fhir:Claim'],
  ['The claim number', '—', ['used', 'Bikram-Sambat fiscal-year code, e.g. 2083-084-000123 — unique inside one scheme only'], ['—', 'the hospital\'s own invoice number'], 'claimCode'],
  ['What happens to it', 'openIMIS statuses and rejection reasons', ['used', 'Entered → Checked → Processed → Valuated / Rejected; reasons 1–21, with 6 = "Item/Service duplicated"'], ['—', 'notified of rejection and resubmits'], 'ClaimStatus · RejectionReason'],
  ['Routine reporting', 'DHIS2 (national HMIS)', ['used', 'separate from claims'], ['used', 'monthly report to the HMIS'], '—'],
];

const GAPS = [
  ['The same person in two schemes', 'HIB and SSF each know their own member number; nothing joins them.', 'The ontology has one Beneficiary with several Memberships, and an IdentityKey: National ID first, else name + date of birth + sex. Rule R3 uses it.'],
  ['The diagnosis is never checked against the treatment', 'openIMIS switched reason 8 off; there is no protocol in the system.', 'TreatmentProtocol per diagnosis (what is allowed, typical length of stay), elicited from the HIB expert. The STG rule uses it.'],
  ['No duplicate check at all', 'Reason 6 is commented out in openIMIS; the frequency edit compares nothing by default.', 'Rules R1–R5 compare a claim with the person\'s history across facilities and schemes.'],
  ['Rules live in people\'s heads', 'Reviewers apply their own logic; nothing records why a claim was flagged.', 'Every rule is an object with a condition, a because, a weight, the fraud type and red flag it uses, and where it came from.'],
  ['Four names for one field', 'Legacy database columns, Django fields, GraphQL fields and FHIR elements all differ.', 'FHIR names are the canonical ones; a crosswalk maps the rest (03_naming_standards).'],
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
      <div className="card"><b>Rules are things, not code</b><span className="small">Each rule (R1–R5, STG) has a condition, a plain-language <i>because</i>, a weight, the fraud type it detects, the red flag it looks for, and its source. That is what makes every flag explainable.</span></div>
      <div className="card"><b>Everything else is borrowed</b><span className="small">FHIR resource names, ICD-10 codes, openIMIS statuses and rejection reasons, the World Bank / NHCAA fraud typology. 44 classes, 62 properties, every term labelled and defined, written in OWL 2 / Turtle.</span></div>
    </div>

    <h2>2 · Which codes a Nepali claim actually uses <small>by what is on the claim</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="std-table"><thead><tr><th>On the claim</th><th>International standard</th><th>HIB and SSF today</th><th>Nepali hospitals today</th><th>In our ontology</th></tr></thead>
        <tbody>{ON_A_CLAIM.map(([what, intl, [s1, t1], [s2, t2], ours]) => <tr key={what}>
          <td>{what}</td><td className="small">{intl}</td>
          <td className="small">{s1 !== '—' && <Tag k={s1} />}{t1}</td>
          <td className="small">{s2 !== '—' && <Tag k={s2} />}{t2}</td>
          <td className="mono small">{ours}</td>
        </tr>)}</tbody></table>
    </div>
    <p className="std-note mt">Reading the table: the diagnosis, the doctor and the exchange format follow international standards; the treatment, the tests and the medicines do not, and the patient has no identifier both schemes share. Hospital practice varies; the rows describe the common pattern documented by openIMIS, MoHP and WHO Nepal.</p>

    <h2>3 · The gaps it closes</h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="std-table"><thead><tr><th>Gap</th><th>Today</th><th>In the ontology</th></tr></thead>
        <tbody>{GAPS.map(([g, t, o]) => <tr key={g}><td>{g}</td><td className="small">{t}</td><td className="small">{o}</td></tr>)}</tbody></table>
    </div>
    <p className="small mt">The rules themselves, with their thresholds and live counts, are on the <Link to="/rules">Rules page</Link>.</p>

    <details className="mt"><summary className="small mute" style={{ cursor: 'pointer' }}>Sources</summary>
      <ol className="small mute" style={{ margin: '.3rem 0 0 1.1rem', padding: 0 }}>{SOURCES.map(([t, u]) => <li key={t}>{u ? <a href={u} target="_blank" rel="noreferrer">{t}</a> : t}</li>)}</ol>
    </details>
  </div>;
}
