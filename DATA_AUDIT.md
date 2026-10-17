# Source data audit

Primary source: `PrepLadder_Subject_Checklist.xlsx`, 11 worksheets. All 725 non-header lecture rows have a title, unique stable lecture ID, subject, workbook order, and duration. There is no chapter column in the source. Workbook checkmarks initialize 59 Internal Medicine lectures as completed. The source workbook was read only and not modified.

| Subject | Lectures | Total duration | Initially completed |
|---|---:|---:|---:|
| Forensic Medicine | 36 | 28h 16m | 0 |
| Internal Medicine | 141 | 111h 41m | 59 |
| Surgery | 72 | 79h 36m | 0 |
| PSM | 119 | 65h 37m | 0 |
| Obstetrics & Gynaecology | 113 | 108h 07m | 0 |
| Pediatrics | 75 | 32h 52m | 0 |
| Psychiatry | 23 | 23h 44m | 0 |
| Dermatology | 31 | 28h 43m | 0 |
| Orthopedics | 21 | 27h 38m | 0 |
| ENT | 56 | 50h 00m | 0 |
| Ophthalmology | 38 | 41h 26m | 0 |
| **Total** | **725** | **597h 40m** | **59** |

Nine blank workbook duration cells were filled from the user-supplied table in this conversation:

| Subject | No. | Lecture | Supplied duration |
|---|---:|---|---:|
| Forensic Medicine | 7 | Road Traffic Accident Injuries | 39 min |
| Forensic Medicine | 15 | Traces of Evidence | 29 min |
| Forensic Medicine | 34 | Court of Law | 1 hr 11 min |
| Internal Medicine | 77 | Sideroblastic Anemia | 9 min |
| Internal Medicine | 94 | Subarachnoid Hemorrhage | 36 min |
| Surgery | 3 | CNS Tumors | 13 min |
| Surgery | 43 | Prostate and Seminal Vesicles | 1 hr 11 min |
| PSM | 1 | Concept of Health and Disease (Introductory Unit) | 43 min |
| Dermatology | 3 | Basics of Dermatology | 1 hr |

Source duration cells were Excel `[h]:mm` time values. They were converted exactly to integer seconds. The nine supplemental values add 6h 11m. There are no unresolved durations. Identifiers are derived from source sheet, row, and title; repeated titles in different places do not share an ID.

Initial dashboard values: **551h 34m remaining**, **46h 06m completed**, **597h 40m total**, **59 completed lectures**, and **666 remaining lectures**. Primary duration-based completion is about **7.7%**; lecture-count completion is about **8.1%**.
