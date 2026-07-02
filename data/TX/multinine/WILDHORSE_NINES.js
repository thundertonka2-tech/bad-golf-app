const WILDHORSE_NINES = {
  _label: 'Wildhorse (Robson Ranch)',
  west: { name: 'West',
    pars:[4,3,5,4,3,4,4,5,4], hdcp:[7,8,1,2,9,4,6,3,5],
    tees:[
      { label:'Black', rating:36.9, slope:131, yds:[390,180,549,446,152,412,373,551,360] },
      { label:'Blue', rating:36, slope:128, yds:[364,163,534,380,138,380,353,523,333] },
      { label:'Blue/White', rating:35.6, slope:129, yds:[364,163,503,367,128,358,335,523,333] },
      { label:'White', rating:35.4, slope:125, yds:[342,163,503,367,128,358,335,492,308] },
      { label:'Gold', rating:34.1, slope:118, yds:[320,140,444,341,119,335,309,462,260] },
      { label:'Gold/Red', rating:33.2, slope:117, yds:[320,140,416,309,119,305,309,434,260] },
      { label:'Red', rating:33, slope:113, yds:[299,121,416,309,107,305,285,434,243] },
      { label:'Red/Silver', rating:31.8, slope:116, yds:[239,121,310,190,107,263,285,434,243] },
      { label:'Silver', rating:31.3, slope:109, yds:[239,121,310,190,107,263,285,377,184] },
    ] },
  south: { name: 'South',
    pars:[4,5,4,3,4,4,3,5,4], hdcp:[6,1,5,9,7,4,8,3,2],
    tees:[
      { label:'Black', rating:37.2, slope:137, yds:[366,566,385,162,385,395,197,556,434] },
      { label:'Blue', rating:36.6, slope:130, yds:[366,507,361,162,365,395,172,524,409] },
      { label:'Blue/White', rating:36, slope:127, yds:[366,470,361,145,365,369,172,504,385] },
      { label:'White', rating:35.7, slope:127, yds:[342,470,321,145,339,369,172,504,385] },
      { label:'Gold', rating:34.6, slope:124, yds:[307,438,293,128,314,343,148,478,357] },
      { label:'Gold/Red', rating:34, slope:123, yds:[307,407,293,128,314,292,148,457,328] },
      { label:'Red', rating:33.4, slope:119, yds:[271,407,265,112,291,292,126,457,328] },
      { label:'Red/Silver', rating:32.2, slope:122, yds:[271,295,265,112,291,292,100,345,272] },
      { label:'Silver', rating:31.8, slope:109, yds:[271,295,265,80,250,292,100,345,272] },
    ] },
  north: { name: 'North',
    pars:[5,3,4,4,4,5,3,4,4], hdcp:[5,7,9,6,3,8,4,2,1],
    tees:[
      { label:'Black', rating:36.5, slope:133, yds:[588,175,323,352,425,505,195,455,460] },
      { label:'Blue', rating:35.6, slope:128, yds:[555,165
---- wrote /tmp/WILDHORSE_NINES.js (4367 bytes) ----
hite', rating:34.6, slope:129, yds:[555,150,313,337,375,485,165,375,386] },
      { label:'White', rating:34.7, slope:123, yds:[525,150,313,297,375,470,165,375,386] },
      { label:'Gold', rating:33.7, slope:118, yds:[496,135,248,264,355,447,153,335,356] },
      { label:'Gold/Red', rating:32.8, slope:115, yds:[472,135,248,264,323,365,153,278,317] },
      { label:'Red', rating:32.1, slope:113, yds:[472,95,213,201,323,365,140,278,317] },
      { label:'Red/Silver', rating:30.5, slope:106, yds:[309,95,213,201,205,280,140,278,317] },
      { label:'Silver', rating:29.6, slope:101, yds:[309,95,158,170,205,280,90,225,187] },
    ] },
  combos: {
    'south+west': [ {label:'Black',rating:74.1,slope:134}, {label:'Black/Bue',rating:72.8,slope:132}, {label:'Blue',rating:72.6,slope:129}, {label:'Blue/White',rating:71.6,slope:128}, {label:'White',rating:71.1,slope:126}, {label:'Whte/Gold',rating:70,slope:125}, {label:'Gold',rating:68.7,slope:121}, {label:'Gold/Red',rating:67.2,slope:120}, {label:'Red',rating:66.4,slope:116}, {label:'Red/Silver',rating:64,slope:119}, {label:'Silver',rating:63,slope:109} ],
    'north+west': [ {label:'Black',rating:73.4,slope:132}, {label:'Black/Blue',rating:72.4,slope:130}, {label:'Blue',rating:71.6,slope:128}, {label:'Blue/White',rating:70.2,slope:129}, {label:'White',rating:70.1,slope:124}, {label:'White/Gold',rating:68.7,slope:124}, {label:'Gold',rating:67.8,slope:118}, {label:'Gold/Red',rating:66,slope:116}, {label:'Red',rating:65.1,slope:113}, {label:'Red/Silver',rating:62.3,slope:111}, {label:'Silver',rating:60.8,slope:105} ],
    'north+south': [ {label:'Black',rating:73.7,slope:135}, {label:'Black/Blue',rating:72.4,slope:130}, {label:'Blue',rating:72.2,slope:129}, {label:'Blue/White',rating:70.6,slope:128}, {label:'White',rating:70.4,slope:125}, {label:'White/Gold',rating:68.9,slope:123}, {label:'Gold',rating:68.3,slope:121}, {label:'Gold/Red',rating:66.8,slope:119}, {label:'Red',rating:65.5,slope:116}, {label:'Red/Silver',rating:62.7,slope:114}, {label:'Silver',rating:61.3,slope:105} ],
  },
  searchCombos: [ ['south','west'], ['west','north'], ['north','south'] ]
};
