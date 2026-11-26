(() => {
  'use strict';
  const outcomes = [
    {key:'employed', name:'Employed', color:'#216e6c', dash:'', cuts:[40,50,60,70]},
    {key:'unemployed', name:'Unemployed', color:'#9c582e', dash:'7,3', cuts:[1,3,5,10]},
    {key:'outside', name:'Outside the labor force', color:'#556785', dash:'2,3', cuts:[20,30,40,50]}
  ];

  function perHundred(participation, unemploymentRate) {
    const hasParticipation = Number.isFinite(participation);
    const unemployed = hasParticipation && Number.isFinite(unemploymentRate) ? participation * unemploymentRate / 100 : null;
    return {
      employed:unemployed === null ? null : participation - unemployed,
      unemployed,
      outside:hasParticipation ? 100 - participation : null
    };
  }

  // Join by economy and calendar year. A participation-only year still yields an outside share.
  function countrySeries(datasets, measure) {
    const first = Math.min(...datasets.map(d => d.first)), last = Math.max(...datasets.map(d => d.last));
    const names = new Map();
    const indexes = datasets.map(dataset => new Map(dataset.countries.map(country => {
      names.set(country.iso3, country.name);
      return [country.iso3, new Map(country.rows.map(([year,value]) => [year,value]))];
    })));
    const countries = Array.from(names, ([iso3,name]) => {
      const rows = [];
      const series = indexes.map(index => index.get(iso3));
      for (let year = first; year <= last; year++) {
        const [participation, unemploymentRate, publishedEmployment] = series.map(values => values?.get(year) ?? null);
        const status = perHundred(participation,unemploymentRate);
        const value = status[measure];
        rows.push([year,Number.isFinite(value) ? Number(value.toFixed(9)) : null,'',{...status,participation,unemploymentRate,publishedEmployment}]);
      }
      return {iso3,name,rows};
    });
    return {first,last,countries,flags:{}};
  }

  const api = {outcomes,perHundred,countrySeries};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.WorkStatus = api;
})();
