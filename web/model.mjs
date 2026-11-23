export const NUTRIENTS = [
  {id:'energy-kcal',name:'Energy',unit:'kcal'}, {id:'fat',name:'Fat',unit:'g'},
  {id:'saturated-fat',name:'Saturated fat',unit:'g'}, {id:'carbohydrates',name:'Carbohydrate',unit:'g'},
  {id:'sugars',name:'Sugars',unit:'g'}, {id:'fiber',name:'Fibre',unit:'g'},
  {id:'proteins',name:'Protein',unit:'g'}, {id:'sodium',name:'Sodium',unit:'mg',factor:1000},
];
export const FIELDS = 'code,product_name,product_name_en,brands,quantity,serving_size,nutrition_data_per,nutriments,ingredients_text,ingredients_text_en,allergens_tags,traces_tags,countries_tags,image_front_small_url,last_modified_t,product_quantity_unit,serving_quantity_unit';
export function barcode(value) {
  const code=String(value??'').replace(/[\s-]/g,'');
  if (!/^\d{8,14}$/.test(code)) throw new Error('Enter a barcode with 8–14 digits. Spaces and hyphens are fine.');
  return code;
}
export function identity(code) { return barcode(code).replace(/^0+(?=\d)/,''); }
export function tags(values) {
  return Array.isArray(values) ? values.map(v=>typeof v==='string'?v: v?.lc_name||v?.id||'').filter(Boolean).map(v=>v.replace(/^[a-z]{2}:/,'').replaceAll('-',' ')) : [];
}
export function number(value) { return typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null; }
export function basisUnit(p) {
  const basis=String(p.nutrition_data_per||'').toLowerCase();
  if(basis==='100ml') return 'mL';
  const serving=String(p.serving_size||'').toLowerCase();
  if (/\bml\b/.test(serving)) return 'mL';
  if (/\bg\b/.test(serving)) return 'g';
  if (p.product_quantity_unit==='ml') return 'mL';
  if (p.product_quantity_unit==='g') return 'g';
  return null;
}
export function normalize(raw,capturedAt,origin='live') {
  const p=raw?.product;
  if(!p || raw.status===0 || raw.status==='failure') throw new Error('This barcode is not in Open Food Facts. Check the digits or add the product on its website.');
  const code=barcode(p.code||raw.code);
  return {code,name:String(p.product_name_en||p.product_name||'Unnamed product'),brand:String(p.brands||''),
    quantity:String(p.quantity||''),serving:String(p.serving_size||''),basisUnit:basisUnit(p),
    ingredients:String(p.ingredients_text_en||p.ingredients_text||''),allergens:tags(p.allergens_tags),traces:tags(p.traces_tags),countries:tags(p.countries_tags),
    nutrients:Object.fromEntries(NUTRIENTS.map(n=>[n.id,{per100:number(p.nutriments?.[`${n.id}_100g`]),serving:number(p.nutriments?.[`${n.id}_serving`]),modifier:['<','>','~','≤','≥'].includes(p.nutriments?.[`${n.id}_modifier`])?p.nutriments[`${n.id}_modifier`] : ''}])),
    image: typeof p.image_front_small_url==='string' && /^https:\/\/images\.openfoodfacts\.org\//.test(p.image_front_small_url)?p.image_front_small_url:null,
    updatedAt:typeof p.last_modified_t==='number'&&Number.isFinite(p.last_modified_t)&&p.last_modified_t>0?new Date(p.last_modified_t*1000).toISOString():null,
    source:`https://world.openfoodfacts.org/product/${code}`,capturedAt,origin};
}
export function amount(product,nutrient,basis='per100') {
  if(basis==='serving' && !product.serving) return null;
  const value=number(product.nutrients?.[nutrient.id]?.[basis]);
  return value===null?null:value*(nutrient.factor||1);
}
export function formatAmount(value) { return value===null?'Not reported':new Intl.NumberFormat('en-CA',{maximumFractionDigits:2}).format(value); }
export function comparisonNote(products,basis) {
  if(basis==='serving') return 'Each column uses its own reported serving. Serving sizes differ; these amounts are not an equal-portion comparison.';
  const units=new Set(products.map(p=>p.basisUnit));
  if(units.has(null)) return 'Some records do not establish grams or millilitres. Their source-normalized 100 g/mL values are shown without assuming a unit.';
  if(units.size>1) return 'This comparison mixes 100 g and 100 mL. Mass and volume are not interchangeable; no density conversion is applied.';
  return 'Equal stated quantities, as recorded by contributors. Prepared-food labels and national formulations may differ; check the package.';
}
export function validateConfig(c) {
  if(!c || !Number.isInteger(c.maxProducts)||c.maxProducts<2||c.maxProducts>24) throw new Error('config.maxProducts must be an integer from 2 to 24.');
  if(!Array.isArray(c.exampleBarcodes)||!c.exampleBarcodes.every(x=>typeof x==='string'&&/^\d{8,14}$/.test(x))) throw new Error('config.exampleBarcodes must contain barcode strings.');
  if(new Set(c.exampleBarcodes.map(identity)).size!==c.exampleBarcodes.length) throw new Error('config.exampleBarcodes must be unique, including leading-zero aliases.');
  if(!Array.isArray(c.initialBarcodes)||c.initialBarcodes.length>c.maxProducts||!c.initialBarcodes.every(x=>c.exampleBarcodes.includes(x))) throw new Error('config.initialBarcodes must fit maxProducts and exist in exampleBarcodes.');
  if(!Number.isInteger(c.requestIntervalMs)||c.requestIntervalMs<4200) throw new Error('config.requestIntervalMs must be at least 4200.');
  if(!Number.isInteger(c.requestsPerMinute)||c.requestsPerMinute<1||c.requestsPerMinute>12) throw new Error('config.requestsPerMinute must be 1–12.');
  return c;
}
export function productURL(code) {
  const u=new URL(`https://world.openfoodfacts.org/api/v3/product/${barcode(code)}`);
  u.searchParams.set('fields',FIELDS);u.searchParams.set('lc','en');u.searchParams.set('cc','ca');
  u.searchParams.set('User-Agent','CoolCode-LabelCompare/1.0 (https://coolcode.ca/labelcompare/)');
  return u.href;
}
export function csv(products,basis) {
  const esc=v=>{let value=String(v??'');if(typeof v==='string'&&/^\s*[=+@\-\t\r]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};
  const header=['Barcode','Product','Brand','Basis','Serving','Source','Retrieved','Attribution','Data licence',...NUTRIENTS.flatMap(n=>[`${n.name} (${n.unit})`,`${n.name} qualifier`])];
  const rows=products.map(p=>[p.code,p.name,p.brand,basis==='serving'?'reported serving':`100 ${p.basisUnit||'g/mL (unit unknown)'}`,p.serving,p.source,p.capturedAt,'Open Food Facts contributors','https://opendatacommons.org/licenses/odbl/1-0/',...NUTRIENTS.flatMap(n=>{const v=amount(p,n,basis);return [v??'',v===null?'':p.nutrients[n.id].modifier];})]);
  return [header,...rows].map(row=>row.map(esc).join(',')).join('\r\n');
}
export function validateReceipt(value,maxProducts) {
  if(value?.schemaVersion!==1||value?.tool!=='labelcompare'||!Array.isArray(value.records)||value.records.length>maxProducts) throw new Error('Choose a Label Compare receipt within the configured comparison capacity.');
  const seen=new Set();
  return value.records.map(r=>{
    if(typeof r.capturedAt!=='string'||!Number.isFinite(Date.parse(r.capturedAt))) throw new Error('Receipt has an invalid capture date.');
    const p=normalize(r.raw,r.capturedAt,'imported');if(seen.has(identity(p.code)))throw new Error('Receipt contains duplicate barcodes.');seen.add(identity(p.code));
    return {...r,product:p};
  });
}
