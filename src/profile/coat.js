export const COATS = Object.freeze(['black', 'calico', 'gray', 'orange']);
export const DEFAULT_COAT = 'black';
export const COAT_KEY = 'coat';

export const isCoat = (value) => typeof value === 'string' && COATS.includes(value);

export const normalizeCoat = (value) => (isCoat(value) ? value : DEFAULT_COAT);
