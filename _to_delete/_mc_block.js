// ============================================================
// OK multi-course municipal facilities (v585) — each is one club with two
// full 18-hole courses; the v530 picker loads each 18 by composite id
// <libId>:<key>. Ratings from GolfPass/course sites; per-course GPS still
// needs on-device mapping.
// ============================================================
const EARLYWINE_COURSES = {
  _label: "Earlywine Golf Club",
  north: { name: "North Course",
    pars: [4,5,4,3,4,3,4,5,4,4,4,3,5,4,3,4,4,5],
    sis:  [7,17,15,11,5,1,9,13,3,4,6,12,18,16,14,2,10,8],
    tees: [
      { label:"Black", rating:74, slope:137, yds:[] },
      { label:"Blue", rating:70.9, slope:135, ratingW:77.9, slopeW:142, yds:[] },
      { label:"White", rating:67.5, slope:129, ratingW:73.8, slopeW:136, yds:[] },
      { label:"Yellow", rating:67.1, slope:129, ratingW:72.3, slopeW:130, yds:[] },
    ] },
  south: { name: "South Course",
    pars: [4,4,3,5,3,5,4,3,4,3,4,3,4,3,5,4,5,4],
    sis:  [9,15,1,11,13,5,7,17,3,8,16,14,6,12,18,2,10,4],
    tees: [
      { label:"Black", rating:71, slope:119, yds:[] },
      { label:"Blue", rating:68.8, slope:116, yds:[] },
      { label:"White", rating:67.1, slope:111, ratingW:72.9, slopeW:123, yds:[] },
      { label:"Yellow", rating:65.9, slope:110, ratingW:71.6, slopeW:122, yds:[] },
    ] },
};

const LAKEHEFNER_COURSES = {
  _label: "Lake Hefner Golf Club",
  north: { name: "North Course",
    pars: [4,3,4,5,4,4,5,3,4,4,5,4,4,3,4,4,3,5],
    sis:  [13,17,1,3,9,15,5,11,7,4,8,2,12,18,16,10,6,14],
    tees: [
      { label:"Black", rating:73.7, slope:126, yds:[] },
      { label:"Blue", rating:71.1, slope:123, yds:[] },
      { label:"White", rating:68.4, slope:120, ratingW:74.5, slopeW:132, yds:[] },
      { label:"Gold", rating:65.2, slope:114, yds:[] },
    ] },
  south: { name: "South Course",
    pars: [4,4,3,4,3,5,3,5,4,4,4,4,3,5,3,5,3,4],
    sis:  [15,1,17,11,13,5,7,3,9,4,6,12,14,2,16,10,18,8],
    tees: [
      { label:"Blue", rating:70.5, slope:123, yds:[] },
      { label:"White", rating:68.4, slope:118, ratingW:74.6, slopeW:130, yds:[] },
      { label:"Gold", rating:65.3, slope:112, yds:[] },
    ] },
};

const PAGEBELCHER_COURSES = {
  _label: "Page Belcher Golf Course",
  stonecreek: { name: "Stone Creek",
    pars: [5,3,4,3,4,4,4,3,5,5,4,4,3,5,3,4,4,4],
    sis:  [5,17,9,15,11,3,1,13,7,4,12,18,16,6,10,8,14,2],
    tees: [
      { label:"Gold", rating:72.2, slope:132, yds:[] },
      { label:"Maroon", rating:69.6, slope:125, yds:[] },
      { label:"Green", rating:67.6, slope:121, yds:[] },
      { label:"Silver", rating:65.7, slope:109, ratingW:71.1, slopeW:118, yds:[] },
    ] },
  oldepage: { name: "Olde Page",
    pars: [5,4,4,4,3,4,4,3,5,4,4,3,4,4,5,3,5,4],
    sis:  [5,13,7,1,9,11,15,17,3,14,8,16,12,4,2,18,10,6],
    tees: [
      { label:"Gold", rating:72.5, slope:127, yds:[] },
      { label:"Maroon", rating:69.9, slope:124, yds:[] },
      { label:"Green", rating:68.1, slope:122, yds:[] },
      { label:"Silver", rating:66.2, slope:122, ratingW:72.9, slopeW:128, yds:[] },
    ] },
};

const WINSTAR_COURSES = {
  _label: "WinStar Golf Club",
  scissortail: { name: "Scissortail",
    pars: [5,4,4,4,3,4,4,3,5,4,3,4,5,4,5,4,3,4],
    sis:  [1,9,7,13,17,3,11,15,5,12,18,14,2,6,10,8,16,4],
    tees: [
      { label:"Black", rating:75.8, slope:137, yds:[] },
      { label:"Blue", rating:73.2, slope:135, yds:[] },
      { label:"White", rating:70.6, slope:127, yds:[] },
      { label:"Gold", rating:67.9, slope:120, ratingW:73.7, slopeW:130, yds:[] },
    ] },
  redbud: { name: "RedBud",
    pars: [4,4,3,4,4,5,3,4,5,4,4,5,4,3,5,4,4,3],
    sis:  [7,5,15,11,13,1,17,9,3,10,8,2,14,18,4,6,12,16],
    tees: [
      { label:"Black", rating:74.8, slope:124, yds:[] },
      { label:"Blue", rating:72.1, slope:120, yds:[] },
      { label:"White", rating:69.8, slope:118, yds:[] },
      { label:"Gold", rating:67.4, slope:112, ratingW:73.7, slopeW:127, yds:[] },
    ] },
};

const LINCOLNPARK_COURSES = {
  _label: "Lincoln Park Golf Course",
  east: { name: "East Course",
    pars: [4,3,4,5,4,4,4,4,3,3,4,4,4,4,5,4,3,4],
    sis:  [17,9,13,7,1,15,3,11,5,16,10,6,2,14,8,4,18,12],
    tees: [
      { label:"Blue", rating:70, slope:120, yds:[] },
      { label:"White", rating:66.6, slope:105, yds:[] },
    ] },
  west: { name: "West Course",
    pars: [5,3,4,4,4,4,5,4,3,3,4,3,5,4,3,5,4,4],
    sis:  [1,15,7,17,3,9,5,13,11,8,12,4,6,16,14,2,10,18],
    tees: [
      { label:"Black", rating:70.1, slope:122, yds:[] },
      { label:"Blue", rating:69.5, slope:120, yds:[] },
      { label:"White", rating:67.7, slope:118, yds:[] },
    ] },
};

