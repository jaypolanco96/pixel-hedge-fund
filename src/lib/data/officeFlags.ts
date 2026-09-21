export interface OfficeFlag {
	id: string;
	name: string;
}

/** The office decoration set. Brazil is the default in deskSettings.ts. */
export const OFFICE_FLAGS: OfficeFlag[] = [
	{ id: 'BR', name: 'Brazil' }, { id: 'DO', name: 'Dominican Republic' }, { id: 'PR', name: 'Puerto Rico' },
	{ id: 'US', name: 'United States' }, { id: 'CA', name: 'Canada' }, { id: 'MX', name: 'Mexico' },
	{ id: 'CO', name: 'Colombia' }, { id: 'AR', name: 'Argentina' }, { id: 'CL', name: 'Chile' },
	{ id: 'PE', name: 'Peru' }, { id: 'VE', name: 'Venezuela' }, { id: 'PA', name: 'Panama' },
	{ id: 'CR', name: 'Costa Rica' }, { id: 'JM', name: 'Jamaica' }, { id: 'CU', name: 'Cuba' },
	{ id: 'HT', name: 'Haiti' }, { id: 'TT', name: 'Trinidad and Tobago' }, { id: 'GB', name: 'United Kingdom' },
	{ id: 'IE', name: 'Ireland' }, { id: 'FR', name: 'France' }, { id: 'DE', name: 'Germany' },
	{ id: 'IT', name: 'Italy' }, { id: 'ES', name: 'Spain' }, { id: 'PT', name: 'Portugal' },
	{ id: 'JP', name: 'Japan' }, { id: 'KR', name: 'South Korea' }, { id: 'CN', name: 'China' },
	{ id: 'IN', name: 'India' }, { id: 'AU', name: 'Australia' }, { id: 'NZ', name: 'New Zealand' },
	{ id: 'NG', name: 'Nigeria' }, { id: 'ZA', name: 'South Africa' }, { id: 'GH', name: 'Ghana' }
];

export const DEFAULT_OFFICE_FLAG = OFFICE_FLAGS[0];
