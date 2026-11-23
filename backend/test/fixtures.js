/**
 * test/fixtures.js — FAKE sample OCR text for tests. All names, numbers and
 * addresses are invented. The Aadhaar number is generated so that it passes
 * the Verhoeff checksum, but it is not a real person's number.
 */

'use strict';

const { verhoeffCheckDigit } = require('../services/validators');

const AADHAAR_BASE = '28473916502';
const FAKE_AADHAAR = AADHAAR_BASE + verhoeffCheckDigit(AADHAAR_BASE);
const FAKE_AADHAAR_SPACED = `${FAKE_AADHAAR.slice(0, 4)} ${FAKE_AADHAAR.slice(4, 8)} ${FAKE_AADHAAR.slice(8)}`;

const AADHAAR_FRONT = `
भारत सरकार
GOVERNMENT OF INDIA
सुनीता शर्मा
Sunita Sharma
जन्म तिथि/DOB: 14/08/1994
महिला/ FEMALE
${FAKE_AADHAAR_SPACED}
मेरा आधार, मेरी पहचान
`;

const AADHAAR_BACK = `
Unique Identification Authority of India
Address:
W/O: Ramesh Sharma, 45, Gandhi Nagar,
Near Shiv Mandir, Bassi, Jaipur,
Rajasthan - 303301
${FAKE_AADHAAR_SPACED}
help@uidai.gov.in www.uidai.gov.in
`;

const PAN_CARD = `
आयकर विभाग INCOME TAX DEPARTMENT
भारत सरकार GOVT. OF INDIA
स्थायी लेखा संख्या कार्ड
Permanent Account Number Card
ABCPS1234K
नाम / Name
SUNITA SHARMA
पिता का नाम / Father's Name
MOHAN LAL SHARMA
जन्म की तारीख / Date of Birth
14/08/1994
`;

const VOTER_ID = `
ELECTION COMMISSION OF INDIA
ELECTOR PHOTO IDENTITY CARD
RJX1234567
Name : Sunita Sharma
Husband's Name : Ramesh Sharma
Gender : Female
Date of Birth : 14/08/1994
Address : 45, Gandhi Nagar, Bassi, Jaipur, Rajasthan 303301
Date of Issue : 10/03/2013
`;

const ELECTRICITY_BILL = `
Jaipur Vidyut Vitran Nigam Ltd. (JVVNL)
Electricity Bill
K No.: 210412345678
Name: Sunita Sharma
Address: 45 Gandhi Nagar Bassi Jaipur 303301
Bill Date: 05/06/2015
Units Consumed: 142
Due Date: 20/06/2015
`;

const MARKSHEET_10 = `
माध्यमिक शिक्षा बोर्ड राजस्थान, अजमेर
BOARD OF SECONDARY EDUCATION, RAJASTHAN, AJMER
Secondary Examination 2010
Roll No.: 1234567
Name of Candidate : SUNITA KUMARI
Father's Name : MOHAN LAL SHARMA
Mother's Name : KAMLA DEVI
School : GOVT. SR. SEC. SCHOOL, BASSI, JAIPUR
Total Marks 452/600 75.33% FIRST DIVISION
`;

const DL = `
Rajasthan Transport Department
Driving Licence
DL No: RJ14 20120045678
Name: Sunita Sharma
S/O, D/O, W/O: Ramesh Sharma
Date of Birth: 14-08-1994
Date of Issue: 21/07/2012
Valid Till: 20/07/2032
LMV MCWG
Address: 45, Gandhi Nagar, Bassi, Jaipur, Rajasthan 303301
`;

module.exports = {
  FAKE_AADHAAR, FAKE_AADHAAR_SPACED,
  AADHAAR_FRONT, AADHAAR_BACK, PAN_CARD, VOTER_ID, ELECTRICITY_BILL, MARKSHEET_10, DL,
};
