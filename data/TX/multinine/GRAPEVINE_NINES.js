const GRAPEVINE_NINES = {
  _label: 'Grapevine',
  mockingbird: { name: 'Mockingbird',
    pars:[4,3,4,4,5,4,3,4,5], hdcp:[1,8,4,2,3,7,9,6,5],
    tees:[
      { label:'Black', rating:36.7, slope:133, yds:[445,228,386,411,524,319,181,382,515] },
      { label:'Blue', rating:35.7, slope:130, yds:[427,183,367,388,508,304,159,362,490] },
      { label:'White', rating:34.7, slope:127, yds:[400,153,348,370,492,286,137,342,431] },
      { label:'Purple', rating:32.2, slope:117, yds:[352,120,277,319,431,221,120,232,360] },
    ] },
  pecan: { name: 'Pecan',
    pars:[4,3,4,5,4,4,4,3,5], hdcp:[5,9,2,4,3,1,7,8,6],
    tees:[
      { label:'Black', rating:37.6, slope:139, yds:[429,168,426,578,405,442,370,184,569] },
      { label:'Blue', rating:36.4, slope:132, yds:[405,158,397,549,386,412,342,157,536] },
      { label:'White', rating:35.5, slope:127, yds:[396,144,371,499,365,387,311,141,503] },
      { label:'Purple', rating:33.5, slope:119, yds:[339,116,327,440,280,355,295,109,418] },
    ] },
  bluebonnet: { name: 'Bluebonnet',
    pars:[5,4,4,3,5,4,4,3,4], hdcp:[6,3,1,4,7,5,8,9,2],
    tees:[
      { label:'Black', rating:36.8, slope:127, yds:[552,389,456,220,506,414,303,178,421] },
   
---- wrote /tmp/GRAPEVINE_NINES.js (2157 bytes) ----
0,431,196,478,382,285,152,388] },
      { label:'White', rating:34.8, slope:119, yds:[502,326,408,178,453,361,265,129,355] },
      { label:'Purple', rating:32.7, slope:111, yds:[452,305,316,91,374,327,226,110,321] },
    ] },
  combos: {
    'mockingbird+pecan': [ {label:'Black',rating:74.3,slope:136}, {label:'Blue',rating:72.1,slope:131}, {label:'White',rating:70.2,slope:127}, {label:'Purple',rating:65.7,slope:118} ],
    'bluebonnet+mockingbird': [ {label:'Black',rating:73.5,slope:130}, {label:'Blue',rating:71.4,slope:127}, {label:'White',rating:69.5,slope:123}, {label:'Purple',rating:64.9,slope:114} ],
    'bluebonnet+pecan': [ {label:'Black',rating:74.4,slope:133}, {label:'Blue',rating:72.1,slope:128}, {label:'White',rating:70.3,slope:123}, {label:'Purple',rating:66.2,slope:115} ],
  },
  searchCombos: [ ['pecan','mockingbird'], ['mockingbird','bluebonnet'], ['pecan','bluebonnet'] ]
};
