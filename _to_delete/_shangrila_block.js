// ============================================================
// Shangri-La Golf Club (OK) three-nine (v586) — Champions/Legends/Heritage,
// each par 36. Per-nine ratings factored from the 3 combos (rating-PASS).
// Per-nine GPS still needs on-device mapping.
// ============================================================
const SHANGRILA_NINES = {
  _label: "Shangri-La Golf Club",
  champions: { name: "Champions",
    pars:[5,3,4,4,4,3,5,4,4], hdcp:[5,7,9,2,3,8,6,1,4],
    tees:[
      { label:"#1", rating:36.3, slope:143, yds:[] },
      { label:"#2", rating:35.8, slope:138, yds:[] },
      { label:"#3", rating:34.7, slope:135, yds:[] },
      { label:"#4", rating:33.2, slope:129, yds:[] },
      { label:"#5", rating:31.5, slope:122, yds:[] },
      { label:"#4-Women", rating:35.7, slope:133, yds:[] },
      { label:"Combo-Women", rating:35.7, slope:133, yds:[] },
      { label:"#5-Women", rating:34.1, slope:123, yds:[] },
    ] },
  legends: { name: "Legends",
    pars:[5,3,4,3,4,4,5,3,5], hdcp:[5,4,1,9,8,3,7,6,2],
    tees:[
      { label:"#1", rating:37.3, slope:143, yds:[] },
      { label:"#2", rating:36.4, slope:138, yds:[] },
      { label:"#3", rating:35.2, slope:133, yds:[] },
      { label:"#4", rating:34.1, slope:128, yds:[] },
      { label:"#5", rating:32.9, slope:123, yds:[] },
      { label:"#4-Women", rating:37.1, slope:131, yds:[] },
      { label:"Combo-Women", rating:36.1, slope:131, yds:[] },
      { label:"#5-Women", rating:35.2, slope:126, yds:[] },
    ] },
  heritage: { name: "Heritage",
    pars:[4,4,4,5,3,4,4,3,5], hdcp:[3,9,4,6,8,1,5,7,2],
    tees:[
      { label:"#1", rating:38.8, slope:146, yds:[] },
      { label:"#2", rating:36.9, slope:138, yds:[] },
      { label:"#3", rating:36.1, slope:136, yds:[] },
      { label:"#4", rating:34.6, slope:132, yds:[] },
      { label:"#5", rating:33.3, slope:126, yds:[] },
      { label:"#4-Women", rating:37.7, slope:136, yds:[] },
      { label:"Combo-Women", rating:37.1, slope:134, yds:[] },
      { label:"#5-Women", rating:35.9, slope:128, yds:[] },
    ] },
  combos: {
    "legends+champions": [ {label:"#1",rating:73.6,slope:140}, {label:"#2",rating:72.3,slope:138}, {label:"#3",rating:69.9,slope:132}, {label:"#4",rating:67.3,slope:125}, {label:"#5",rating:64.4,slope:119}, {label:"#4-Women",rating:72.8,slope:128}, {label:"Combo-Women",rating:71.7,slope:129}, {label:"#5-Women",rating:69.3,slope:120} ],
    "heritage+legends": [ {label:"#1",rating:76,slope:146}, {label:"#2",rating:73.4,slope:138}, {label:"#3",rating:71.3,slope:134}, {label:"#4",rating:68.7,slope:131}, {label:"#5",rating:66.2,slope:126}, {label:"#4-Women",rating:74.7,slope:133}, {label:"Combo-Women",rating:73.1,slope:132}, {label:"#5-Women",rating:71.1,slope:131} ],
    "champions+heritage": [ {label:"#1",rating:75.1,slope:146}, {label:"#2",rating:72.8,slope:138}, {label:"#3",rating:70.8,slope:138}, {label:"#4",rating:67.8,slope:132}, {label:"#5",rating:64.8,slope:125}, {label:"#4-Women",rating:73.4,slope:138}, {label:"Combo-Women",rating:72.7,slope:136}, {label:"#5-Women",rating:69.9,slope:125} ],
  },
  searchCombos: [ ["legends","champions"], ["heritage","legends"], ["champions","heritage"] ]
};
