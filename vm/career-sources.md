# Career content sources

This note records the September 2026 career content refresh. It is a repository
reference; it is not included in the guest image or rendered on the website.
The editable content is `site/_data/career.json`.

## Material reviewed

- The LinkedIn experience excerpt supplied by Chase in this conversation.
- 38 résumé PDFs in `~/Downloads`, including 33 distinct extracted texts.
- Dated résumés from September 2014; December 2015 and 2016; January 2017;
  May and November 2019; March 2020; February, August, September, and October
  2022; and December 2023.
- The undated `ChaseFarrant-Resume.pdf`, `ChaseFarrant-Resume (copy).pdf`,
  `ChaseFarrant-Resume-Attempt#3.pdf`, and `NewResume` variants.

The two-column PDFs were extracted with the work-history column separated from
sidebar skills. Skills listed only in a general sidebar were not assigned to
individual employers. Repeated wording and duplicate files were compared so
that distinct older work could be retained without repeating the same claim.

## Dates and numbers

The supplied LinkedIn excerpt takes precedence where it explicitly updates the
four main employers. The revised entries use:

- Veritone: April 2022–February 2024, Staff Engineer, remote.
- Viagio / Artisan: April 2020–April 2022. The undated résumés also show
  progression from Cloud Engineer to Senior Cloud Engineer; that progression
  is retained without adding a disputed promotion timeline.
- Balance Innovations: May 2017–April 2020.
- Avalara: June 2014–May 2017 overall, with Network Administrator through
  February 2016 and Continuous Integration Engineer from February 2016.

Specific differences were reconciled as follows:

| Subject | Source differences | Wording used |
| --- | --- | --- |
| Veritone deployment time | December 2023 versions say 8 hours; the supplied LinkedIn excerpt and undated detailed résumés say 12 hours | 12 hours to 35 minutes, without downtime |
| Veritone environment | One undated version describes VMs across AWS and Azure; the excerpt and other versions specify EC2 and Auto Scaling | 1,000+ EC2 instances, 30+ load balancers, 20+ Auto Scaling groups in the largest environment |
| Viagio ongoing clients | Some variants say five; the excerpt and the undated detailed résumé say four | Four long-term clients |
| Viagio project and client counts | The detailed résumé gives seven new projects; the December 2023 versions give responsibility for 15+ clients | Both retained with their separate scopes; neither is presented as the long-term support count |
| Balance environment setup | Older versions say 90%; one draft says one week to two hours; the excerpt and later versions say 95% | 95% reduction in new environment setup time |
| Avalara automated applications | Older versions say 20+; the excerpt and detailed later versions say 17 | 17 applications for deployment and database migration automation |
| Avalara administration scope | Older Network Administrator descriptions range from 15+ to 20+ applications | 20+ managed applications and web services, based on the 2019–2022 descriptions of that role |
| Avalara SQL jobs | One draft says 20+; the excerpt and other résumés say 30+ | 30+ SQL jobs |
| K-State start date | 2014–2017 résumés say April 2011; 2019–2022 résumés say April 2010 | April 2010 provisionally; Chase should confirm this date |

A malformed Veritone end date in `ChaseFarrant-Resume.pdf` was not reused.
The other employment dates above come directly from the supplied excerpt.

## Details recovered by employer

### Veritone

Primary sources: the LinkedIn excerpt; `ChaseFarrant-Resume.pdf`; the copy and
Attempt #3 variants; `Chase-Farrant-Resume-2022-09-23.pdf`; the December 2023
versions; and the `NewResume` variants.

Retained the 27-service versioning and release work, deployment scale and timing,
Ruby-to-Python rewrite with 96% less code, configuration and logging improvements,
testing and error handling, legacy script maintenance, EKS/Terraform/ArgoCD/Helm,
Jenkins on Kubernetes with Groovy, GitHub Actions, and Docker/build-time work.

### Viagio / Artisan

Primary sources: the LinkedIn excerpt; February, August, and September 2022
résumés; December 2023 résumés; and the undated detailed résumé.

Retained new project delivery, reusable AWS and Azure templates, months-to-days
onboarding, responsibility for 15+ clients, Terraform imports and refactoring,
four ongoing clients, Python automation, architecture and delivery decisions,
AWS Organizations/SSO, StackSets, shared infrastructure practices, handover
notes and diagrams, and guidance for two direct reports.

### Balance Innovations

Primary sources: the LinkedIn excerpt; May and November 2019, March 2020, and
February–September 2022 résumés; the undated detailed résumé; and later drafts.

Retained environment setup, CloudFormation exports and delivery conventions,
30+ service pipelines, identity-provider custom resources, account creation,
SSO and temporary credentials, IAM/KMS management, Access Provisioner,
CloudTrail/VPC/Athena, patching and document pipelines, backup summaries,
three application migrations, customer VPNs, reserved-instance management,
legacy delivery tools, DynamoDB design, application architecture, and audit
and AWS Partner work. The audit wording stays at "SOC audit" because the older
résumés use "SOC I" without explaining the report type.

### BillSoft / EZTax / Avalara

Primary sources: the LinkedIn excerpt; December 2015 and 2016, January 2017,
2019–2022 résumés; and the undated detailed résumé.

The two roles have separate dated sections. Retained release automation,
Jenkins/Ansible ownership, three AWS migrations, deployments without downtime,
repeatable SQL scripts, UAT refreshes saving about two days, and collaboration
across development, QA, project management, and IT. Earlier administration work
includes SaaS operations, 20+ applications, SQL maintenance and restore tests,
Veeam backups, PRTG, ASP.NET client tooling, C# data processing and firewall
configuration tools, a 70+ user network, a wiki, and a simulated phishing exercise.

### Earlier work

- Payless: September 2014, December 2015 and 2016, January 2017, and May 2019
  résumés. Retained the summer internship, 15–20 VBScript installers, SCCM
  deployment to 1,200+ PCs, three Windows Server upgrades, VMware cleanup,
  and 20+ Juniper routers. The 2014 résumé gives the 120+ VM scope; later
  versions give the 30% resource reclamation.
- K-State: 2014–2022 résumés. Retained office IT support, Windows 7 deployment,
  eleven images reduced to two, ImageX/Sysprep/MDT, Active Directory/Group
  Policy printer deployment, scripting, website work, and troubleshooting.
  The start-date discrepancy is listed above.
- Topeka Sod Farm appeared in the September 2014 résumé and was excluded
  from the career listing at Chase's request.

## Deferred

DataStax is deferred at Chase's request. The provided excerpt supplies a title
and dates, but the reviewed PDFs do not contain that role's accomplishments.

## Company history

The short history notes in `role.txt` distinguish acquisitions from renames:

- BillSoft became EZtax in October 2014:
  [EZtax company announcement](https://www.prweb.com/releases/billsoft_announces_rebrand_as_eztax_/prweb12226353.htm).
- Avalara acquired EZtax in June 2015:
  [Avalara company announcement](https://www.prweb.com/releases/avalara_acquires_eztax_telecom_tax_automation_provider/prweb12761039.htm).
- Brink's acquired Balance Innovations in June 2019:
  [Brink's SEC filing](https://www.sec.gov/Archives/edgar/data/78890/000007889020000087/bco-20200930.htm).
- Artisan Technology Group was renamed Viagio Technologies in May 2022:
  [company announcement](https://www.businessheraldonline.com/article/570175181-artisan-technology-group-unveils-new-name-viagio-technologies).
  This rename followed Chase's April 2022 departure; it was not an acquisition.
