const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../public-source/world-maps.js');
const row=(geo_id,year,value,more={})=>({geo_id,year,value,eligible:true,...more});
const ppp=(geo,year,value,more={})=>row(geo,year,value,{series_id:'wdi::NY.GDP.PCAP.PP.KD',...more});
test('PPP comparison joins the exact selected year without borrowing the 2022 snapshot or rounding source values',()=>{
 const x=[row('AAA',2022,7.123456789),row('AAA',2023,9),row('BBB',2023,0),row('CCC',2023,8)],y=[ppp('AAA',2022,6543.987654321),ppp('AAA',2023,7000.123456789),ppp('BBB',2022,5),ppp('CCC',2023,null)];
 const before=JSON.stringify([x,y]);assert.deepEqual(M.exactPPPPairs(x,y,2022,['AAA','BBB','CCC']),[{id:'AAA',w:7.123456789,p:6543.987654321}]);assert.deepEqual(M.exactPPPPairs(x,y,2023,['AAA','BBB','CCC']),[{id:'AAA',w:9,p:7000.123456789}]);assert.deepEqual(M.exactPPPPairs(x,y,2024),[]);assert.deepEqual(M.exactPPPPairs(x,y,null),[]);assert.equal(JSON.stringify([x,y]),before);
});
test('ambiguous, ineligible, unmatched and wrong-indicator PPP cells stay unpaired while native zero is retained',()=>{
 const x=[row('AAA',2024,1),row('AAA',2024,2),row('BBB',2024,3),row('CCC',2024,4),row('DDD',2024,0),row('EEE',2024,5),row('FFF',2024,6)],y=[ppp('AAA',2024,10),ppp('BBB',2024,20),ppp('BBB',2024,21),ppp('CCC',2024,30,{eligible:false}),ppp('DDD',2024,40),ppp('EEE',2024,50,{series_id:'wdi::NY.GDP.MKTP.PP.KD'}),ppp('FFF',2024,60)];
 assert.deepEqual(M.exactPPPPairs(x,y,2024,['AAA','BBB','CCC','DDD','EEE']),[{id:'DDD',w:0,p:40}]);
});
test('signed square-root, signed-log and linear legend positions invert to the actual native value',()=>{
 const rows=[row('AAA',2020,-1000),row('AAA',2021,-25),row('AAA',2022,0),row('AAA',2023,12.5),row('AAA',2024,750)],scale=M.createDisplayScale(rows);
 for(const mode of ['sqrt','log','site_linear'])for(const value of [-1000,-25,0,12.5,750,1000])assert.ok(Math.abs(scale.invert(scale.position(value,mode),mode)-value)<1e-8,mode+' '+value);
 assert.equal(scale.position(0,'sqrt'),0.5);assert.equal(scale.invert(0.75,'sqrt'),250);
});
test('display domains exclude duplicate/ineligible extremes and remain fixed across source-year frames',()=>{
 const rows=[row('AAA',2000,2),row('AAA',2024,20),row('BBB',2024,999),row('BBB',2024,1000),row('CCC',2024,5000,{eligible:false}),row('DDD',2024,0)],scale=M.createDisplayScale(rows);
 assert.deepEqual(scale.sorted,[0,2,20]);assert.equal(scale.max,20);assert.equal(scale.position(2,'site_linear'),0.1);
 for(const mode of ['sqrt','log','quantile']){const position=scale.position(2,mode);for(const year of [2000,2024]){M.frameRows(M.rowsForYear(rows,year));assert.equal(scale.position(2,mode),position);}}
});
test('history sparklines keep missing calendar gaps and ambiguous source years unjoined',()=>{
 const rows=[row('AAA',2000,0),row('AAA',2001,2),row('AAA',2002,null),row('AAA',2003,3),row('AAA',2003,4),row('AAA',2004,5),row('AAA',2005,6)],before=JSON.stringify(rows),segments=M.historySegments(rows);
 assert.deepEqual(segments.map(part=>part.map(r=>r.year)),[[2000,2001],[2004,2005]]);assert.equal(segments[0][0].value,0);assert.equal(JSON.stringify(rows),before);
});
test('retained live PPP packet supplies exact 2022 and 2023 source values without a fixed auxiliary copy',()=>{
 const packet=require('../public-source/data/economic-valuation.json');assert.equal(packet.base_year,2021);
 const native=packet.macro_context.records.filter(r=>r.series_id==='wdi::NY.GDP.PCAP.PP.KD'&&r.geo_id==='USA'&&M.numeric(r));
 const x=[2022,2023].map(year=>row('USA',year,year));
 for(const year of [2022,2023]){const source=native.find(r=>r.year===year);assert.ok(source);const paired=M.exactPPPPairs(x,packet.macro_context.records,year,['USA']);assert.equal(paired.length,1);assert.equal(paired[0].p,Number(source.value));}
});
