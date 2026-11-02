// qa/audit_round.js -- the synthetic 22-game, 4-player audit round shared by the Units-tab DOM suites
// (qa_units_par_row.js, qa_units_stacked_card.js). qa_units_tab.js carries the same round inline.
// It is read as TEXT and evaluated inside the app window, so keep it plain script: no require, no exports.
const P = ['a','b','c','d'].map((k,i)=>({ id:'p'+i, name:['Tyler OConnor','Kevin Wells','Frank LoNigro','Matteo Irvine'][i], hcp:[6,18,10,14][i], handicap:[6,18,10,14][i] }));
const ids = P.map(p=>p.id);
const pars = [4,5,3,4,4,3,5,4,4, 4,4,5,3,4,4,3,5,4];
const sis  = [7,1,17,5,11,15,3,13,9, 8,2,4,18,6,12,16,10,14];
const S = {
  p0:[4,5,2,4,5,3,6,4,3, 5,4,5,3,4,3,4,5,4],
  p1:[6,7,4,5,6,4,7,6,5, 6,6,7,5,6,5,4,7,6],
  p2:[5,5,3,4,4,4,5,5,4, 4,5,6,3,5,4,3,6,5],
  p3:[5,6,3,6,5,3,6,5,4, 5,5,6,4,5,5,4,6,4],
};
const two = { teamA:[ids[0],ids[1]], teamB:[ids[2],ids[3]] };
const parts = { participants: ids, participantNames: P.map(p=>p.name) };
const games = {
  skins:{mode:'perskin',buyin:5,value:1,hcpPct:100,require:'net',tieRule:'carry',...parts},
  nassau:{value:10,format:'stroke',hioPay:0,eaglePay:0,birdiePay:0,allowHuckle:true,...parts},
  stroke:{net:true,buyin:10,...parts},
  banker:{net:true,mode:'rotation',order:'random',defaultBet:5,birdieBasis:'gross',...parts},
  vegas:{net:true,...two,value:0.25,rotate:'fixed',...parts},
  dvegas:{net:true,value:1,...parts},
  sixes:{net:true,value:5,...parts},
  splixSixes:{net:false,mode:'perpoint',buyin:0,value:1,payout:'winner',...parts},
  niners:{value:1,...parts},
  highLow:{net:true,value:2,...two,...parts},
  animals:{value:1,...parts},
  marks:{value:1,birdieBasis:'gross',...parts},
  hotPotato:{value:1,trigger:'3-putt',...parts},
  stableford:{net:true,mode:'pool',buyin:5,value:0,payout:'winner',...parts},
  bingoBangoBongo:{value:1,...parts},
  wolf:{value:5,...parts},
  hammer:{value:5,mode:'individual',...parts},
  match:{net:true,value:5,pair:[P[0].name,P[1].name],participants:[ids[0],ids[1]],participantNames:[P[0].name,P[1].name],instances:[{net:true,value:5,pair:[P[0].name,P[1].name],participants:[ids[0],ids[1]],participantNames:[P[0].name,P[1].name]}]},
  teamMatch:{net:true,...two,value:20},
  teamLowball:{net:true,...two,value:10,teamMode:'2man'},
  comboScore:{net:false,...two,value:20,teamMode:'2man'},
  quota:{net:false,mode:'pool',basis:'auto',buyin:10,value:0,payout:'winner',...parts},
  teamQuota:{net:false,mode:'pool',basis:'auto',buyin:20,...two,value:0,teamMode:'2man'},
  p3greenie:{value:5,bfValue:5,bfEnabled:true,ignore3Putt:false,birdieOverride:true,...parts},
  ctp:{holes:[3],value:2,...parts},
  longPutt:{value:5,...parts},
  longDrive:{value:5,...parts},
  lowNetPool:{mode:'pool',value:5,hcpPct:100,...parts},
  girPool:{mode:'pool',value:5,...parts},
  puttsPool:{mode:'pool',value:5,...parts},
  junk:{gir:1,arnie:1,polie:1,sandy:1,barkie:1,chipin:1,...parts},
  birdiePool:{hio:50,eagle:20,birdie:10,birdieBasis:'gross',...parts},
  umbrella:{value:1,...two,...parts},
  potofgold:{net:true,base:0.125,carry:false,potMode:'each',...parts},
};
const g = {
  code:'AUDIT01', createdAt:Date.now(), course:'Audit GC', players:P, scores:S, pars, sis,
  games, hcpRules:{ allowance:100 }, holes:18, startHole:1,
  trackPutts:true, trackGirs:true, trackFairways:true,
  puttsData:{ p0:[2,2,1,2,2,1,2,2,1, 2,2,2,1,2,1,2,2,2], p1:[3,3,2,2,3,2,3,3,2, 3,3,3,2,3,2,2,3,3], p2:[2,2,2,2,2,2,2,2,2, 2,2,2,2,2,2,1,2,2], p3:[2,3,2,3,2,2,2,2,2, 2,2,3,2,2,2,2,3,2] },
  girData:{ p0:[1,1,1,1,0,1,1,1,1, 0,1,1,1,1,1,0,1,1], p1:[0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0], p2:[1,0,1,1,1,0,1,0,1, 1,0,0,1,0,1,1,0,0], p3:[0,0,1,0,0,1,0,0,1, 0,0,0,0,0,0,1,0,1] },
  junkData:{ '2':{ gir:[ids[0]], sandy:[ids[2]] }, '7':{ chipin:[ids[1]] }, '14':{ polie:[ids[3]] } },
  ctpData:{ '3':{ pid:ids[0], ft:12 }, '6':{ pid:ids[2], ft:20 } },
  p3greenieData:{ '3':{ winners:[ids[0]] }, '6':{ winners:[ids[2]] }, '13':{ winners:[ids[1]] }, '16':{ winners:[ids[3]] } },
  bbbData:{ '1':{bingo:ids[0],bango:ids[1],bongo:ids[2]}, '5':{bingo:ids[3],bango:ids[0]}, '11':{bongo:ids[1]}, '17':{bingo:ids[2],bango:ids[2],bongo:ids[2]} },
  potatoData:{ '2':{holder:[ids[1]]}, '6':{holder:[ids[3]]}, '9':{holder:[ids[0]]}, '15':{holder:[ids[2]]} },
  wolfData:{ holes:{ '1':{choice:'partner',partnerId:ids[1]}, '2':{choice:'lone'}, '3':{choice:'partner',partnerId:ids[3]}, '4':{choice:'blind'}, '5':{choice:'partner',partnerId:ids[0]}, '6':{choice:'lone'}, '7':{choice:'partner',partnerId:ids[2]}, '8':{choice:'partner',partnerId:ids[0]}, '9':{choice:'lone'}, '10':{choice:'partner',partnerId:ids[1]}, '11':{choice:'partner',partnerId:ids[2]}, '12':{choice:'lone'}, '13':{choice:'partner',partnerId:ids[3]}, '14':{choice:'partner',partnerId:ids[0]}, '15':{choice:'lone'}, '16':{choice:'partner',partnerId:ids[1]}, '17':{choice:'partner',partnerId:ids[2]}, '18':{choice:'lone'} } },
  hammerData:{ holes:{ '4':{thrownBy:ids[0],accepted:true,value:10}, '9':{thrownBy:ids[1],accepted:false}, '13':{thrownBy:ids[2],accepted:true,value:20} } },
  longPuttData:{ pid:ids[1], ft:41 },
  longDriveData:{ pid:ids[0], yards:295 },
};
for (const k of Object.keys(ctx)) {} // keep ctx alive
const holes = 18;
