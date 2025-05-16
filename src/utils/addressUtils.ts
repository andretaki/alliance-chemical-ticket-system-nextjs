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
    return getCountryCode(countryName);
}

export function mapProvinceToCode(provinceName?: string, countryName?: string): string | undefined {
    const countryCode = getCountryCode(countryName);
    if (countryCode) {
        return getProvinceCode(provinceName, countryCode);
    }
    // If country name is not provided or not found, try to match province name directly if it looks like a code
    if (provinceName && provinceName.length === 2 && provinceName === provinceName.toUpperCase()) {
        return provinceName;
    }
    return undefined;
} 