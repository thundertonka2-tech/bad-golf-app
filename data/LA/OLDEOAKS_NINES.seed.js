const OLDEOAKS_NINES = {
  _label: 'Olde Oaks',
  meadow: { name: 'Meadow',
    pars:[5,4,3,4,4,4,3,4,5], hdcp:[4,3,9,5,8,1,6,2,7],
    tees:[
      { label:'Blue', rating:36.6, slope:125, yds:[535,422,152,419,388,450,184,405,500] },
      { label:'White', rating:35.3, slope:119, yds:[502,395,132,395,361,415,157,380,483] },
      { label:'Yellow', rating:34.8, slope:109, yds:[456,326,115,355,290,355,112,322,448] },
    ] },
  oak: { name: 'Oak',
    pars:[5,4,3,4,4,5,3,4,4], hdcp:[2,5,8,6,3,4,7,9,1],
    tees:[
      { label:'Blue', rating:35.9, slope:135, yds:[554,319,152,408,411,541,189,361,384] },
      { label:'White', rating:34.8, slope:125, yds:[525,295,137,384,385,504,121,318,363] },
      { label:'Yellow', rating:35, slope:123, yds:[475,273,128,330,327,433,115,279,342] },
    ] },
  cypress: { name: 'Cypress',
    pars:[5,4,4,3,4,4,3,4,5], hdcp:[1,9,7,6,3,4,2,8,5],
    tees:[
      { label:'Blue', rating:36.4, slope:127, yds:[526,389,351,177,416,393,218,372,508] },
      { label:'White', rating:35.2, slope:125, yds:[506,366,338,153,381,359,191,335,467] },
      { label:'Yellow', rating:35, slope:119, yds:[456,328,279,125,346,319,175,312,427] },
    ] },
  combos: {
    'meadow+oak': [ {label:'Gold',rating:75.2,slope:139}, {label:'Blue',rating:72.5,slope:130}, {label:'White',rating:70.1,slope:122}, {label:'Yellow',rating:69.7,slope:116} ],
    'cypress+meadow': [ {label:'Gold',rating:75.2,slope:136}, {label:'Blue',rating:73,slope:126}, {label:'White',rating:70.5,slope:122}, {label:'Yellow',rating:69.7,slope:114} ],
    'cypress+oak': [ {label:'Black',rating:75,slope:143}, {label:'Blue',rating:72.3,slope:131}, {label:'White',rating:70,slope:125}, {label:'Yellow',rating:69.9,slope:121} ],
  },
  searchCombos: [ ['meadow','oak'], ['cypress','meadow'], ['oak','cypress'] ]
};
