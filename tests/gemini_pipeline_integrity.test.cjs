'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {endpointSummary,magnitudeSummary,magnitudeShare}=require('../public-source/workbench/pipelines.js');
const {exportView}=require('../public-source/workbench/public-pipeline-exports.js');

test('endpoint amounts distinguish observed zero, missing-only directions and signed source values',()=>{
 const links=[{from_id:'a',to_id:'b',value:0},{from_id:'b',to_id:'c',value:null},{from_id:'c',to_id:'a',value:-7}];
 assert.deepEqual(endpointSummary(links,'b'),{out:null,in:0,connections:2,missing:1});
 assert.deepEqual(endpointSummary(links,'a'),{out:0,in:-7,connections:2,missing:0});
 assert.deepEqual(endpointSummary(links,'c',false),{out:null,in:null,connections:2,missing:1});
});
test('endpoint self-loops count once while preserving both reported endpoint roles',()=>{
 assert.deepEqual(endpointSummary([{from_id:'a',to_id:'a',value:12}],'a'),{out:12,in:12,connections:1,missing:0});
});
test('magnitude summaries never turn unquantified references into measured zero or sum nonadditive metrics',()=>{
 assert.deepEqual(magnitudeSummary([{value:null},{value:undefined}]),{value:null,measured:0,missing:2});
 assert.deepEqual(magnitudeSummary([{value:0},{value:null}]),{value:0,measured:1,missing:1});
 assert.deepEqual(magnitudeSummary([{value:-7},{value:3}],false),{value:null,measured:2,missing:0});
 assert.equal(magnitudeShare({value:-7},[{value:-7},{value:3}]),'70.0% of absolute selected amount');
 assert.equal(magnitudeShare({value:3},[{value:3}],false),'Share unavailable');
});
test('SVG export refuses an incompatible globe or spike view before any source read or download',async()=>{
 for(const mode of ['globe','spikes'])await assert.rejects(exportView({format:'svg',settings:{flow_studio:{mode}}}),/Choose 2D Geodesic Flow Map/);
});
