export const COATS = Object.freeze(['black', 'calico', 'gray', 'orange']);
export const DEFAULT_COAT = 'black';
export const COAT_KEY = 'coat';

export const isCoat = (value) => typeof value === 'string' && COATS.includes(value);

export const normalizeCoat = (value) => (isCoat(value) ? value : DEFAULT_COAT);

export const coatOf = (ctx) => normalizeCoat(ctx?.coat);

export async function readCoat(ctx) {
  if (isCoat(ctx?.coat)) return ctx.coat;
  if (typeof ctx?.store?.get !== 'function') return DEFAULT_COAT;
  try {
    return normalizeCoat(await ctx.store.get(COAT_KEY));
  } catch (err) {
    console.warn('The coat colour could not be read', err);
    return DEFAULT_COAT;
  }
}
