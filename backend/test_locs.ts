import { analyzeLocation } from './src/matching/country-normalizer.js';

const locs = [
  "Bengaluru, Karnataka, IN",
  "Mumbai, Maharashtra, IN",
  "Bhagalpur, Bihar, IN",
  "Hyderabad, Telangana, IN",
  "Noida, Uttar Pradesh, IN",
  "Jabalpur, Madhya Pradesh, IN",
  "Kochi, Kerala, IN",
  "Pune, Maharashtra, IN",
  "Coimbatore, Tamil Nadu, IN",
  "Tirupati, Andhra Pradesh, IN",
  "Mysore, Karnataka, IN"
];

for (const loc of locs) {
  const res = analyzeLocation(loc);
  if (!res.detectedCountries.includes('India')) {
    console.log(`NON-INDIA: ${loc}`);
  }
}
