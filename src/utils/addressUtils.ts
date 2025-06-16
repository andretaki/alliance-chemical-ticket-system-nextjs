interface Country {
  name: string;
  code: string;
  provinces?: Province[];
}
interface Province {
  name: string;
  code: string;
}

// A very limited list for example purposes.
// In a real application, use a comprehensive library or data source.
const countries: Country[] = [
  {
    name: "United States", code: "US",
    provinces: [
      { name: "Alabama", code: "AL" }, { name: "Alaska", code: "AK" },
      { name: "Arizona", code: "AZ" }, { name: "Arkansas", code: "AR" },
      { name: "California", code: "CA" }, { name: "Colorado", code: "CO" },
      { name: "Connecticut", code: "CT" }, { name: "Delaware", code: "DE" },
      { name: "Florida", code: "FL" }, { name: "Georgia", code: "GA" },
      { name: "Hawaii", code: "HI" }, { name: "Idaho", code: "ID" },
      { name: "Illinois", code: "IL" }, { name: "Indiana", code: "IN" },
      { name: "Iowa", code: "IA" }, { name: "Kansas", code: "KS" },
      { name: "Kentucky", code: "KY" }, { name: "Louisiana", code: "LA" },
      { name: "Maine", code: "ME" }, { name: "Maryland", code: "MD" },
      { name: "Massachusetts", code: "MA" }, { name: "Michigan", code: "MI" },
      { name: "Minnesota", code: "MN" }, { name: "Mississippi", code: "MS" },
      { name: "Missouri", code: "MO" }, { name: "Montana", code: "MT" },
      { name: "Nebraska", code: "NE" }, { name: "Nevada", code: "NV" },
      { name: "New Hampshire", code: "NH" }, { name: "New Jersey", code: "NJ" },
      { name: "New Mexico", code: "NM" }, { name: "New York", code: "NY" },
      { name: "North Carolina", code: "NC" }, { name: "North Dakota", code: "ND" },
      { name: "Ohio", code: "OH" }, { name: "Oklahoma", code: "OK" },
      { name: "Oregon", code: "OR" }, { name: "Pennsylvania", code: "PA" },
      { name: "Rhode Island", code: "RI" }, { name: "South Carolina", code: "SC" },
      { name: "South Dakota", code: "SD" }, { name: "Tennessee", code: "TN" },
      { name: "Texas", code: "TX" }, { name: "Utah", code: "UT" },
      { name: "Vermont", code: "VT" }, { name: "Virginia", code: "VA" },
      { name: "Washington", code: "WA" }, { name: "West Virginia", code: "WV" },
      { name: "Wisconsin", code: "WI" }, { name: "Wyoming", code: "WY" },
    ],
  },
  {
    name: "Canada", code: "CA",
    provinces: [
      { name: "Alberta", code: "AB" }, { name: "British Columbia", code: "BC" },
      { name: "Manitoba", code: "MB" }, { name: "New Brunswick", code: "NB" },
      { name: "Newfoundland and Labrador", code: "NL" }, { name: "Nova Scotia", code: "NS" },
      { name: "Ontario", code: "ON" }, { name: "Prince Edward Island", code: "PE" },
      { name: "Quebec", code: "QC" }, { name: "Saskatchewan", code: "SK" },
    ],
  },
  // Add more countries and their provinces/states as needed
];

const countryCodeMap: Record<string, string> = {
  'united states': 'US',
  'usa': 'US',
  'u.s.a.': 'US',
  'canada': 'CA',
  // Add more common names and their codes
};

const provinceCodeMap: Record<string, Record<string, string>> = {
  US: {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
    'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
    'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
    'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
    'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
    'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
    'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
    'district of columbia': 'DC',
    // Allow 2-letter codes to pass through
    'AL': 'AL', 'AK': 'AK', 'AZ': 'AZ', 'AR': 'AR', 'CA': 'CA', 'CO': 'CO', 'CT': 'CT', 'DE': 'DE', 'FL': 'FL', 'GA': 'GA', 
    'HI': 'HI', 'ID': 'ID', 'IL': 'IL', 'IN': 'IN', 'IA': 'IA', 'KS': 'KS', 'KY': 'KY', 'LA': 'LA', 'ME': 'ME', 'MD': 'MD', 
    'MA': 'MA', 'MI': 'MI', 'MN': 'MN', 'MS': 'MS', 'MO': 'MO', 'MT': 'MT', 'NE': 'NE', 'NV': 'NV', 'NH': 'NH', 'NJ': 'NJ', 
    'NM': 'NM', 'NY': 'NY', 'NC': 'NC', 'ND': 'ND', 'OH': 'OH', 'OK': 'OK', 'OR': 'OR', 'PA': 'PA', 'RI': 'RI', 'SC': 'SC', 
    'SD': 'SD', 'TN': 'TN', 'TX': 'TX', 'UT': 'UT', 'VT': 'VT', 'VA': 'VA', 'WA': 'WA', 'WV': 'WV', 'WI': 'WI', 'WY': 'WY', 
    'DC': 'DC'
  },
  CA: {
    'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB', 'new brunswick': 'NB',
    'newfoundland and labrador': 'NL', 'nova scotia': 'NS', 'ontario': 'ON',
    'prince edward island': 'PE', 'quebec': 'QC', 'saskatchewan': 'SK',
    'northwest territories': 'NT', 'nunavut': 'NU', 'yukon': 'YT',
    // Allow 2-letter codes to pass through
    'AB': 'AB', 'BC': 'BC', 'MB': 'MB', 'NB': 'NB', 'NL': 'NL', 'NS': 'NS', 'NT': 'NT', 'NU': 'NU', 'ON': 'ON', 'PE': 'PE', 
    'QC': 'QC', 'SK': 'SK', 'YT': 'YT'
  }
};

export function getCountryCode(countryName?: string): string | undefined {
  if (!countryName) return undefined;
  const country = countries.find(c => c.name.toLowerCase() === countryName.toLowerCase());
  return country?.code;
}

export function getProvinceCode(provinceName?: string, countryCode?: string): string | undefined {
  if (!provinceName || !countryCode) return undefined;

  const country = countries.find(c => c.code.toLowerCase() === countryCode.toLowerCase());
  if (!country || !country.provinces) {
    // If country not found or has no provinces list, or if provinceName is already a code
    if (provinceName.length === 2 && provinceName === provinceName.toUpperCase()) {
      return provinceName; // Assume it's already a code
    }
    return undefined;
  }

  const province = country.provinces.find(p => p.name.toLowerCase() === provinceName.toLowerCase() || p.code.toLowerCase() === provinceName.toLowerCase());
  
  if (province) {
    return province.code;
  }
  
  // Fallback for two-letter codes if not found in specific list (e.g. user inputs "TX")
  if (provinceName.length === 2 && provinceName === provinceName.toUpperCase()) {
    return provinceName;
  }
  
  return undefined;
}

export function mapCountryToCode(countryName?: string): string | undefined {
  if (!countryName) return undefined;
  const lowerCountryName = countryName.toLowerCase();
  if (lowerCountryName.length === 2 && countryCodeMap[lowerCountryName] === undefined) { // Assume it's already a code if not in map as full name
    const upperCode = countryName.toUpperCase();
    // Basic validation for common Shopify country codes if it looks like a code already
    if (['US', 'CA'].includes(upperCode)) return upperCode; // Add more known valid codes
     // If it's 2 letters but not a known code, it might still be valid for Shopify, but we prefer mapped ones
  }
  return countryCodeMap[lowerCountryName] || (countryName.length === 2 ? countryName.toUpperCase() : undefined);
}

export function mapProvinceToCode(provinceName?: string, countryNameOrCode?: string): string | undefined {
  if (!provinceName) return undefined;
  
  const countryCode = mapCountryToCode(countryNameOrCode) || (countryNameOrCode?.length === 2 ? countryNameOrCode?.toUpperCase() : undefined);
  if (!countryCode) return undefined; 

  const provincesForCountry = provinceCodeMap[countryCode];
  if (!provincesForCountry) return undefined; // No mapping for this country

  // If provinceName is already a 2-letter code and exists in the mapping for that country, return it
  if (provinceName.length === 2 && provincesForCountry[provinceName.toUpperCase()]) {
    return provinceName.toUpperCase();
  }
  // Otherwise, try to map from full name
  return provincesForCountry[provinceName.toLowerCase()] || (provinceName.length === 2 ? provinceName.toUpperCase() : undefined);
} 