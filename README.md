# Insulinsimulator

Morgonglas på 3 dl. Uppskattad insulin- och glukoskurva för havredryck, mjölk, juice, nektar och läsk som säljs i Sverige.

Belastning 100 är samma volym Coca-Cola, fastande, typisk känslighet. Det är en modell för en frisk vuxen — inte ett laboratorievärde och inte en insulindos.

## Cloudflare Worker

`cloudflare/src/index.ts` serverar sidan och `/api/simulate`. Samma beräkning ligger i `src/lib/insulin.ts`, listan i `src/data/drinks.ts`.

```bash
npx wrangler dev
npx wrangler deploy
```

Rapsolja dämpar och fördröjer toppen. Den tar inte bort maltosen. Oatly No Sugars och Alpro Not M\*lk (0 g sockerarter) ligger klart under klassisk havredryck. Garant Eko har ingen tillsatt olja. Mjölk har låg glukos och ändå hög insulin på grund av proteinet.
