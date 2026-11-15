// New account setup only. Existing login identifiers remain valid.
export const normalizeSetupUsername=value=>typeof value==='string'?value.trim().toLowerCase():'';
export const validSetupUsername=value=>/^(?=.*[a-z])(?=.*[0-9])[a-z0-9]{4,40}$/.test(normalizeSetupUsername(value));
