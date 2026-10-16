const SUPABASE_URL="https://qxiufjlserfxgblftieb.supabase.co";
const SUPABASE_KEY="sb_publishable_H0hMUqF1YM5rUT9cdLAqJA_qiQfNznA";
const supabaseClient=window.cg5Supabase||window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

function isCg5Admin(){
    return window.cg5Access?.isAdmin()===true;
}

const ROTATION_START_DATE="2026-09-01";
const FIRST_MONTH=new Date(2026,8,1);
const calendarParams=new URLSearchParams(window.location.search);
const homeCalendarDate=calendarParams.get("home")==="1"?calendarParams.get("date"):null;

const POW_MAIN_START=13481,POW_MAIN_END=21800,POW_EXTRA_START=21800,POW_EXTRA_END=null;
const OW_OPS_START=24531,OW_OPS_END=29521;
const LIAISON_START=30686,LIAISON_END=32648;
const OOD_START=2880,OOD_END=3582;

const BC_PATTERN=[
    {ow:"B",operation:"BC",liaison:"C"},
    {ow:"BC",operation:"B",liaison:"C"},
    {ow:"B",operation:"BC",liaison:"C"},
    {ow:"BC",operation:"B",liaison:"C"},
    {ow:"C",operation:"BC",liaison:"C"}
];

const APPLIED_ROTATION_CONFIG_KEY="cg5DutyRotationConfig";
const APPLIED_ROTATION_ROSTER_KEY="cg5DutyRotationRoster";
const GENERATOR_RANGE_SET_KEY="cg5DutyGeneratorRangeSet";
const GENERATOR_RANGE_SETS={
    A:{
        officewatch:{from:"032232",to:"024531"},
        operation:{from:"029521",to:"024531"}
    },
    B:{
        officewatch:{from:"029521",to:"024531"},
        operation:{from:"032232",to:"024531"}
    }
};

let visibleMonth=homeCalendarDate&&/^\d{4}-\d{2}-\d{2}$/.test(homeCalendarDate)
    ?new Date(Number(homeCalendarDate.slice(0,4)),Number(homeCalendarDate.slice(5,7))-1,1)
    :new Date(FIRST_MONTH);
let personnel=[];
let exemptions=[];
let specialDuties=[];
let roster={};
let selectedDate=null;
let editingPersonnelId=null;
let exemptionPersonnelId=null;
let specialDutyPersonnelId=null;
let editingSpecialDutyId=null;
let rotationState={};
let pendingSwaps={};
let bcRotationState={B:null,C:null};
let weekendBCNextGroup="B";
let generatedDutyRotation=null;
let generatorPools=null;
let generatorRangeSet="A";

const $=id=>document.getElementById(id);

const calendarEl=$("duty-calendar");
const calendarMonthEl=$("calendar-month");
const previousMonthBtn=$("previous-month");
const nextMonthBtn=$("next-month");
const dutySearch=$("duty-search");
const dutyDetailsContent=$("duty-details-content");
const dutyStatus=$("duty-status");

const addPersonnelBtn=$("add-personnel-btn");
const personnelForm=$("personnel-form");
const personnelSerial=$("personnel-serial");
const personnelName=$("personnel-name");
const personnelDuty=$("personnel-duty");
const personnelDesk=$("personnel-desk");
const savePersonnelBtn=$("save-personnel-btn");
const cancelPersonnelBtn=$("cancel-personnel");
const personnelStatus=$("personnel-status");
const personnelList=$("personnel-list");

const swapInformation=$("swap-information");
const exemptionList=$("exemption-list");
const exemptionModal=$("exemption-modal");
const exemptionPersonnel=$("exemption-personnel");
const exemptionReason=$("exemption-reason");
const exemptionStart=$("exemption-start");
const exemptionEnd=$("exemption-end");
const exemptionDecision=$("exemption-decision");
const saveExemptionBtn=$("save-exemption");
const cancelExemptionBtn=$("cancel-exemption");
const closeExemptionBtn=$("close-exemption");
const exemptionStatus=$("exemption-status");

const DUTY_TYPES={
    OOD:"OOD",
    POW:"POW",
    OFFICEWATCH:"Officewatch",
    OPERATION:"Operation",
    LIAISON:"Liaison"
};

function on(e,event,handler){
    if(e)e.addEventListener(event,handler);
}

function escapeHtml(v){
    return String(v??"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function normalizeDuty(d){
    d=String(d||"").trim();

    if(d==="Duty Officewatch and Operation")
        return"Duty Officewatch/Operation";

    if(d==="Duty Officewatch and Operation and Liaison")
        return"Duty Officewatch/Operation/Liaison";

    return d;
}

function getShortDutyLabel(d){
    switch(normalizeDuty(d)){
        case"Duty Officewatch/Operation":
            return"Duty OW/OPS";
        case"Duty Officewatch/Operation/Liaison":
            return"Duty OW/OPS/Liaison";
        default:
            return normalizeDuty(d);
    }
}

function formatDateKey(d){
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function parseDateKey(k){
    const[y,m,d]=String(k).split("-").map(Number);
    return new Date(y,m-1,d);
}

function addDays(d,n){
    const r=new Date(d);
    r.setDate(r.getDate()+n);
    return r;
}

function isWeekend(k){
    const d=parseDateKey(k).getDay();
    return d===0||d===6;
}

function formatLongDate(k){
    return parseDateKey(k).toLocaleDateString(
        "en-US",
        {
            weekday:"long",
            month:"long",
            day:"numeric",
            year:"numeric"
        }
    );
}

function getMonthStart(){
    return new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth(),
        1
    );
}

function getMonthEnd(){
    return new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth()+1,
        0
    );
}

function getNumericSerial(serial){
    const v=String(serial??"").trim().toUpperCase();

    if(/^O[-\s]?\d+$/.test(v))
        return null;

    const digits=v.replace(/\D/g,"");

    return digits?Number(digits):null;
}

function getOodSerial(serial){
    const m=String(serial??"")
        .trim()
        .toUpperCase()
        .match(/^O[-\s]?(\d+)$/);

    return m?Number(m[1]):null;
}

function compareSerial(a,b){
    const ao=getOodSerial(a.serial_number);
    const bo=getOodSerial(b.serial_number);

    const an=ao!==null?ao:getNumericSerial(a.serial_number);
    const bn=bo!==null?bo:getNumericSerial(b.serial_number);

    if(an!==null&&bn!==null&&an!==bn)
        return bn-an;

    return String(b.serial_number).localeCompare(
        String(a.serial_number),
        undefined,
        {numeric:true}
    );
}

function sortPersonnel(list){
    return[...list].sort(compareSerial);
}

function numberInRange(v,s,e){
    return v!==null&&v>=s&&v<=e;
}

function serialAllowsDuty(serial,type){
    const n=getNumericSerial(serial);
    const o=getOodSerial(serial);

    if(type===DUTY_TYPES.OOD)
        return o!==null&&numberInRange(o,OOD_START,OOD_END);

    if(o!==null||n===null)
        return false;

    if(type===DUTY_TYPES.POW)
        return numberInRange(n,POW_MAIN_START,POW_MAIN_END);

    if(type===DUTY_TYPES.OFFICEWATCH||type===DUTY_TYPES.OPERATION)
        return numberInRange(n,OW_OPS_START,LIAISON_END);

    if(type===DUTY_TYPES.LIAISON)
        return numberInRange(n,LIAISON_START,LIAISON_END);

    return false;
}

function dutySelectionAllowsDuty(selected,type){
    switch(normalizeDuty(selected)){
        case"Duty OOD":
            return type===DUTY_TYPES.OOD;
        case"Duty POW":
            return type===DUTY_TYPES.POW;
        case"Duty Officewatch":
            return type===DUTY_TYPES.OFFICEWATCH;
        case"Duty Operation":
            return type===DUTY_TYPES.OPERATION;
        case"Duty Liaison":
            return type===DUTY_TYPES.LIAISON;
        case"Duty Officewatch/Operation":
            return type===DUTY_TYPES.OFFICEWATCH||
                type===DUTY_TYPES.OPERATION;
        case"Duty Officewatch/Operation/Liaison":
            return type===DUTY_TYPES.OFFICEWATCH||
                type===DUTY_TYPES.OPERATION||
                type===DUTY_TYPES.LIAISON;
        default:
            return false;
    }
}

function personnelActiveOnDate(person,date){
    return!person.created_at||
        String(person.created_at).slice(0,10)<=date;
}

function getPersonnelExemption(id,date){
    return exemptions.find(e=>
        Number(e.personnel_id)===Number(id)&&
        date>=e.start_date&&
        date<=e.end_date
    );
}

function getSpecialDutiesOnDate(date){
    return specialDuties.filter(
        x=>date>=x.start_date&&date<=x.end_date
    );
}

function getSpecialDuty(type,date){
    return specialDuties.find(
        x=>
            x.duty_type===type&&
            date>=x.start_date&&
            date<=x.end_date
    );
}

function getSpecialPersonnelIdsOnDate(date){
    return new Set(
        getSpecialDutiesOnDate(date)
            .map(x=>Number(x.personnel_id))
    );
}

function specialDutyCanAppearOnDate(type,date){
    if(type===DUTY_TYPES.OOD)
        return isWeekend(date);

    if(type===DUTY_TYPES.POW)
        return!isWeekend(date);

    return true;
}

function getEligiblePool(type,date){
    return sortPersonnel(
        personnel.filter(p=>{
            if(!personnelActiveOnDate(p,date))
                return false;

            if(!serialAllowsDuty(p.serial_number,type))
                return false;

            if(!dutySelectionAllowsDuty(p.duty,type))
                return false;

            if(type===DUTY_TYPES.OOD&&!isWeekend(date))
                return false;

            return true;
        })
    );
}

function getBCGroup(person){
    const n=getNumericSerial(person?.serial_number);

    if(n!==null&&n>=24531&&n<=29521)
        return"B";

    if(n!==null&&n>=30686&&n<=32648)
        return"C";

    return null;
}

function getEligibleBCPool(type,date,group){
    return getEligiblePool(type,date)
        .filter(person=>{
            const personGroup=getBCGroup(person);

            if(group==="BC")
                return personGroup==="B"||personGroup==="C";

            return personGroup===group;
        });
}

function getAppliedRotationConfig(){
    try{
        const value=
            localStorage.getItem(
                APPLIED_ROTATION_CONFIG_KEY
            );

        return value?JSON.parse(value):null;
    }catch(error){
        console.warn(
            "Applied rotation configuration:",
            error
        );

        return null;
    }
}

function getAppliedRotationRoster(){
    try{
        const value=
            localStorage.getItem(
                APPLIED_ROTATION_ROSTER_KEY
            );

        return value?JSON.parse(value):null;
    }catch(error){
        console.warn(
            "Applied rotation roster:",
            error
        );

        return null;
    }
}

async function loadSharedAppliedRotation(){
    const{data,error}=await supabaseClient
        .from("duty_rotation_state")
        .select("config, roster")
        .eq("id",1)
        .maybeSingle();

    if(error){
        console.warn("Shared duty rotation loading:",error.message);
        return{available:false,error};
    }

    if(data){
        if(data.config)
            localStorage.setItem(APPLIED_ROTATION_CONFIG_KEY,JSON.stringify(data.config));
        if(data.roster)
            localStorage.setItem(APPLIED_ROTATION_ROSTER_KEY,JSON.stringify(data.roster));
    }else if(isCg5Admin()){
        const cachedConfig=getAppliedRotationConfig();
        const cachedRoster=getAppliedRotationRoster();
        if(cachedRoster&&Object.keys(cachedRoster).length){
            const{error:saveError}=await supabaseClient
                .from("duty_rotation_state")
                .upsert({
                    id:1,
                    config:cachedConfig||{},
                    roster:cachedRoster,
                    updated_at:new Date().toISOString(),
                    updated_by:window.cg5Access?.user?.id||null
                },{onConflict:"id"});
            if(saveError)
                console.warn("Existing local duty rotation could not be shared:",saveError.message);
        }
    }

    return{available:true,hasSharedRoster:!!data};
}

function findPersonById(id){
    if(id===null||id===undefined||id==="")
        return null;

    return personnel.find(
        person=>Number(person.id)===Number(id)
    )||null;
}

function findPersonBySerial(serial){
    if(serial===null||serial===undefined||serial==="")
        return null;

    const target=
        String(serial)
            .trim()
            .toUpperCase();

    return personnel.find(
        person=>
            String(person.serial_number||"")
                .trim()
                .toUpperCase()===target
    )||null;
}

function findPersonByName(name){
    if(!name)
        return null;

    const target=
        String(name)
            .trim()
            .toLowerCase();

    return personnel.find(
        person=>
            String(person.full_name_rank||"")
                .trim()
                .toLowerCase()===target
    )||personnel.find(
        person=>
            String(person.full_name_rank||"")
                .trim()
                .toLowerCase()
                .includes(target)
    )||null;
}

function findAppliedPerson(assignment){
    if(!assignment)
        return null;

    if(typeof assignment==="number"||typeof assignment==="string"){
        return findPersonById(assignment)||
            findPersonBySerial(assignment)||
            findPersonByName(assignment);
    }

    const personObject=
        assignment.person||
        assignment.personnel||
        assignment.assignedPerson||
        null;

    if(personObject&&typeof personObject==="object"){
        const nested=
            findPersonById(
                personObject.id||
                personObject.personnel_id
            )||
            findPersonBySerial(
                personObject.serial_number||
                personObject.serialNumber||
                personObject.serial
            )||
            findPersonByName(
                personObject.full_name_rank||
                personObject.name
            );

        if(nested)
            return nested;
    }

    return findPersonById(
        assignment.personnel_id||
        assignment.personnelId||
        assignment.person_id||
        assignment.personId||
        assignment.id
    )||
    findPersonBySerial(
        assignment.serial_number||
        assignment.serialNumber||
        assignment.serial||
        assignment.personnel_serial
    )||
    findPersonByName(
        assignment.full_name_rank||
        assignment.fullNameRank||
        assignment.name||
        assignment.personnel_name||
        assignment.personnelName
    );
}

function normalizeAppliedSlot(assignment){
    if(!assignment)
        return null;

    const raw=String(
        assignment.slotKey||
        assignment.slot||
        assignment.type||
        assignment.dutyType||
        assignment.duty_type||
        assignment.duty||
        assignment.label||
        assignment.role||
        ""
    )
        .trim()
        .toLowerCase()
        .replace(/\s+/g," ");

    if(
        raw.includes("ow/operation")||
        raw.includes("ow/ops")||
        raw.includes("officewatch/operation")||
        raw.includes("office watch/operation")||
        raw.includes("weekend")
    )
        return{
            slotKey:"weekend-ow-operation",
            label:"Duty OW/Operation"
        };

    if(raw==="pow"||raw==="duty pow")
        return{
            slotKey:"pow",
            label:"Duty POW"
        };

    if(
        raw==="ow"||
        raw==="officewatch"||
        raw==="office watch"||
        raw==="duty ow"||
        raw==="duty officewatch"||
        raw==="duty office watch"
    )
        return{
            slotKey:"officewatch",
            label:"Duty OW"
        };

    if(
        raw==="ops"||
        raw==="operation"||
        raw==="duty operation"
    )
        return{
            slotKey:"operation",
            label:"Duty Operation"
        };

    if(raw==="liaison"||raw==="duty liaison")
        return{
            slotKey:"liaison",
            label:"Duty Liaison"
        };

    if(raw==="ood"||raw==="duty ood")
        return{
            slotKey:"ood",
            label:"Duty OOD"
        };

    return null;
}

function getAppliedDay(date){
    const appliedRoster=
        getAppliedRotationRoster();

    if(!appliedRoster)
        return null;

    if(Array.isArray(appliedRoster)){
        const direct=
            appliedRoster.find(
                item=>{
                    const itemDate=
                        item?.date||
                        item?.dateKey||
                        item?.dutyDate||
                        item?.startDate||
                        null;

                    return String(itemDate||"").slice(0,10)===date;
                }
            );

        if(direct){
            if(Array.isArray(direct.assignments))
                return direct;

            if(
                direct.assignments&&
                typeof direct.assignments==="object"
            )
                return{
                    date,
                    weekend:isWeekend(date),
                    assignments:Object.values(
                        direct.assignments
                    )
                };

            return{
                date,
                weekend:isWeekend(date),
                assignments:[direct]
            };
        }

        return null;
    }

    if(typeof appliedRoster==="object"){
        if(
            appliedRoster[date]&&
            typeof appliedRoster[date]==="object"
        ){
            const day=appliedRoster[date];

            if(Array.isArray(day))
                return{
                    date,
                    weekend:isWeekend(date),
                    assignments:day
                };

            if(Array.isArray(day.assignments))
                return{
                    date,
                    weekend:day.weekend??isWeekend(date),
                    assignments:day.assignments
                };

            if(
                day.assignments&&
                typeof day.assignments==="object"
            )
                return{
                    date,
                    weekend:day.weekend??isWeekend(date),
                    assignments:Object.values(
                        day.assignments
                    )
                };

            return{
                date,
                weekend:day.weekend??isWeekend(date),
                assignments:[day]
            };
        }

        if(Array.isArray(appliedRoster.assignments)){
            const matching=
                appliedRoster.assignments.filter(
                    item=>{
                        const itemDate=
                            item?.date||
                            item?.dateKey||
                            item?.dutyDate||
                            null;

                        return String(itemDate||"").slice(0,10)===date;
                    }
                );

            if(matching.length)
                return{
                    date,
                    weekend:isWeekend(date),
                    assignments:matching
                };
        }

        if(Array.isArray(appliedRoster.roster)){
            const matching=
                appliedRoster.roster.filter(
                    item=>{
                        const itemDate=
                            item?.date||
                            item?.dateKey||
                            item?.dutyDate||
                            null;

                        return String(itemDate||"").slice(0,10)===date;
                    }
                );

            if(matching.length)
                return{
                    date,
                    weekend:isWeekend(date),
                    assignments:matching
                };
        }
    }

    return null;
}

function getAppliedAssignments(date){
    const day=getAppliedDay(date);

    if(!day||!Array.isArray(day.assignments))
        return[];

    return day.assignments;
}

function buildAppliedDayInfo(date,usedIds){
    const assignments=
        getAppliedAssignments(date);

    if(!assignments.length)
        return null;

    const normalized=[];

    assignments.forEach(assignment=>{
        const slot=
            normalizeAppliedSlot(assignment);

        const person=
            findAppliedPerson(assignment);

        if(!slot||!person)
            return;

        const special=
            !!(
                assignment.specialDuty||
                assignment.special_duty||
                assignment.isSpecialDuty
            );

        normalized.push({
            slotKey:slot.slotKey,
            label:
                assignment.label||
                slot.label,
            person,
            specialDuty:special,
            specialDutyId:
                assignment.specialDutyId||
                assignment.special_duty_id||
                null
        });

        usedIds.add(
            Number(person.id)
        );
    });

    if(!normalized.length)
        return null;

    return{
        assignments:normalized,
        messages:[]
    };
}

function applyGeneratedRoster(date,dayInfo,usedIds){
    const applied=
        buildAppliedDayInfo(
            date,
            usedIds
        );

    if(!applied)
        return false;

    dayInfo.assignments=
        applied.assignments;

    dayInfo.messages=
        applied.messages;

    return true;
}

function assignFromPool(
    type,
    date,
    usedIds,
    usedDesks,
    messages
){
    const special=getSpecialDuty(
        type,
        date
    );

    if(
        special&&
        specialDutyCanAppearOnDate(type,date)
    ){
        const forced=personnel.find(
            p=>Number(p.id)===
                Number(special.personnel_id)
        );

        if(
            forced&&
            personnelActiveOnDate(forced,date)
        ){
            const exemption=
                getPersonnelExemption(
                    forced.id,
                    date
                );

            if(exemption){
                messages.push(
                    `${type}: Special Duty for ${forced.full_name_rank} could not be assigned because of an Exemption.`
                );
            }else{
                usedIds.add(
                    Number(forced.id)
                );

                messages.push(
                    `${type}: ${forced.full_name_rank} assigned as SPECIAL DUTY.`
                );

                return{
                    person:forced,
                    specialDuty:true,
                    specialDutyId:special.id
                };
            }
        }
    }

    const pool=getEligiblePool(
        type,
        date
    );

    if(!pool.length)
        return null;

    const last=
        rotationState[type]??null;

    let startIndex=-1;

    if(last!==null){
        startIndex=pool.findIndex(
            p=>Number(p.id)===Number(last)
        );
    }

    const skipped=[];
    const specialToday=
        getSpecialPersonnelIdsOnDate(date);

    for(
        let step=1;
        step<=pool.length;
        step++
    ){
        const index=
            (startIndex+step)%pool.length;

        const person=pool[index];

        if(
            !person||
            specialToday.has(Number(person.id))||
            usedIds.has(Number(person.id))
        )
            continue;

        const exemption=
            getPersonnelExemption(
                person.id,
                date
            );

        if(exemption){
            skipped.push({
                person,
                type:"exemption",
                reason:exemption.reason
            });

            continue;
        }

        usedIds.add(
            Number(person.id)
        );

        rotationState[type]=
            person.id;

        skipped.forEach(x=>{
            messages.push(
                `${type}: ${x.person.full_name_rank} exempted (${x.reason}) → next in line: ${person.full_name_rank}.`
            );
        });

        return{
            person,
            specialDuty:false
        };
    }

    return null;
}

function assignFromBCGroup(
    type,
    date,
    group,
    usedIds,
    usedDesks,
    messages
){
    const special=getSpecialDuty(
        type,
        date
    );

    if(
        special&&
        specialDutyCanAppearOnDate(type,date)
    ){
        const forced=personnel.find(
            p=>Number(p.id)===
                Number(special.personnel_id)
        );

        if(
            forced&&
            personnelActiveOnDate(forced,date)
        ){
            const exemption=
                getPersonnelExemption(
                    forced.id,
                    date
                );

            if(exemption){
                messages.push(
                    `${type}: Special Duty for ${forced.full_name_rank} could not be assigned because of an Exemption.`
                );
            }else{
                usedIds.add(
                    Number(forced.id)
                );

                messages.push(
                    `${type}: ${forced.full_name_rank} assigned as SPECIAL DUTY.`
                );

                return{
                    person:forced,
                    specialDuty:true,
                    specialDutyId:special.id
                };
            }
        }
    }

    const pool=getEligibleBCPool(
        type,
        date,
        group
    );

    if(!pool.length)
        return null;

    const last=
        bcRotationState[group]??null;

    let startIndex=-1;

    if(last!==null){
        startIndex=pool.findIndex(
            p=>Number(p.id)===Number(last)
        );
    }

    const skipped=[];
    const specialToday=
        getSpecialPersonnelIdsOnDate(date);

    for(
        let step=1;
        step<=pool.length;
        step++
    ){
        const index=
            (startIndex+step)%pool.length;

        const person=pool[index];

        if(
            !person||
            specialToday.has(Number(person.id))||
            usedIds.has(Number(person.id))
        )
            continue;

        const exemption=
            getPersonnelExemption(
                person.id,
                date
            );

        if(exemption){
            skipped.push({
                person,
                type:"exemption",
                reason:exemption.reason
            });

            continue;
        }

        usedIds.add(
            Number(person.id)
        );

        bcRotationState[group]=
            person.id;

        skipped.forEach(x=>{
            messages.push(
                `${type}: ${x.person.full_name_rank} exempted (${x.reason}) → next in line: ${person.full_name_rank}.`
            );
        });

        return{
            person,
            specialDuty:false
        };
    }

    return null;
}

function getWeekendLiaisonSelection(duty){
    return dutySelectionAllowsDuty(duty,DUTY_TYPES.OFFICEWATCH)||
        dutySelectionAllowsDuty(duty,DUTY_TYPES.OPERATION)||
        dutySelectionAllowsDuty(duty,DUTY_TYPES.LIAISON);
}

function isBGroupSerial(serial){
    const n=getNumericSerial(serial);

    if(n===null||getOodSerial(serial)!==null)
        return false;

    return numberInRange(n,OW_OPS_START,OW_OPS_END);
}

function getWeekendLiaisonPool(date){
    return sortPersonnel(
        personnel.filter(p=>{
            if(!personnelActiveOnDate(p,date))
                return false;

            if(!isBGroupSerial(p.serial_number))
                return false;

            return getWeekendLiaisonSelection(p.duty);
        })
    );
}

function getGeneratorWeekendLiaisonPool(date){
    return sortPersonnel(
        personnel.filter(person=>{
            if(!personnelActiveOnDate(person,date))
                return false;

            if(!isBGroupSerial(person.serial_number))
                return false;

            return getWeekendLiaisonSelection(person.duty);
        })
    );
}

function assignWeekendBC(
    date,
    usedIds,
    usedDesks,
    messages
){
    const specialOfficewatch=
        getSpecialDuty(
            DUTY_TYPES.OFFICEWATCH,
            date
        );

    const specialOperation=
        getSpecialDuty(
            DUTY_TYPES.OPERATION,
            date
        );

    const weekendSpecial=
        specialOfficewatch||
        specialOperation;

    if(weekendSpecial){
        const forced=personnel.find(
            p=>Number(p.id)===
                Number(weekendSpecial.personnel_id)
        );

        if(
            forced&&
            personnelActiveOnDate(forced,date)
        ){
            const exemption=
                getPersonnelExemption(
                    forced.id,
                    date
                );

            if(!exemption){
                usedIds.add(
                    Number(forced.id)
                );

                messages.push(
                    `OW/Operation: ${forced.full_name_rank} assigned as SPECIAL DUTY.`
                );

                return{
                    person:forced,
                    specialDuty:true,
                    specialDutyId:weekendSpecial.id
                };
            }
        }
    }

    // Weekend OW/Operation is handled by Group C only.
    const group="C";

    const result=
        assignFromBCGroup(
            DUTY_TYPES.OFFICEWATCH,
            date,
            group,
            usedIds,
            usedDesks,
            messages
        );

    if(result){
        weekendBCNextGroup="B";
    }

    return result;
}

function assignWeekendLiaison(
    date,
    usedIds,
    usedDesks,
    messages
){
    const special=getSpecialDuty(
        DUTY_TYPES.LIAISON,
        date
    );

    if(
        special&&
        specialDutyCanAppearOnDate(DUTY_TYPES.LIAISON,date)
    ){
        const forced=personnel.find(
            p=>Number(p.id)===
                Number(special.personnel_id)
        );

        if(
            forced&&
            personnelActiveOnDate(forced,date)
        ){
            const exemption=
                getPersonnelExemption(
                    forced.id,
                    date
                );

            if(exemption){
                messages.push(
                    `Liaison: Special Duty for ${forced.full_name_rank} could not be assigned because of an Exemption.`
                );
            }else{
                usedIds.add(
                    Number(forced.id)
                );

                messages.push(
                    `Liaison: ${forced.full_name_rank} assigned as SPECIAL DUTY.`
                );

                return{
                    person:forced,
                    specialDuty:true,
                    specialDutyId:special.id
                };
            }
        }
    }

    // Weekend Liaison is handled by Group B only.
    const pool=getWeekendLiaisonPool(date);

    if(!pool.length)
        return null;

    const last=
        rotationState["LIAISON_WEEKEND"]??null;

    let startIndex=-1;

    if(last!==null){
        startIndex=pool.findIndex(
            p=>Number(p.id)===Number(last)
        );
    }

    const skipped=[];
    const specialToday=
        getSpecialPersonnelIdsOnDate(date);

    for(
        let step=1;
        step<=pool.length;
        step++
    ){
        const index=
            (startIndex+step)%pool.length;

        const person=pool[index];

        if(
            !person||
            specialToday.has(Number(person.id))||
            usedIds.has(Number(person.id))
        )
            continue;

        const exemption=
            getPersonnelExemption(
                person.id,
                date
            );

        if(exemption){
            skipped.push({
                person,
                type:"exemption",
                reason:exemption.reason
            });

            continue;
        }

        usedIds.add(
            Number(person.id)
        );

        rotationState["LIAISON_WEEKEND"]=
            person.id;

        skipped.forEach(x=>{
            messages.push(
                `Liaison: ${x.person.full_name_rank} exempted (${x.reason}) \u2192 next in line: ${person.full_name_rank}.`
            );
        });

        return{
            person,
            specialDuty:false
        };
    }

    return null;
}

function buildRoster(){
    roster={};
    rotationState={};
    pendingSwaps={};
    bcRotationState={B:null,C:null};
    weekendBCNextGroup="B";

    const weekendBlocks={};

    const start=
        parseDateKey(
            ROTATION_START_DATE
        );

    const visibleStart=
        getMonthStart();

    const visibleEnd=
        getMonthEnd();

    let current=new Date(start);
    let weekdayPatternIndex=0;

    while(current<=visibleEnd){
        const date=
            formatDateKey(current);

        const visible=
            current>=visibleStart;

        const dayInfo={
            assignments:[],
            messages:[]
        };

        const usedIds=new Set();
        const usedDesks=new Set();

        const hasAppliedRoster=
            applyGeneratedRoster(
                date,
                dayInfo,
                usedIds
            );

        if(hasAppliedRoster){
            if(visible)
                roster[date]=dayInfo;

            if(
                isWeekend(date)&&
                parseDateKey(date).getDay()===6
            ){
                weekendBlocks[date]={
                    assignments:
                        dayInfo.assignments.map(
                            a=>({...a})
                        ),
                    messages:[
                        ...dayInfo.messages
                    ]
                };
            }

            current=
                addDays(current,1);

            continue;
        }

        if(!isWeekend(date)){
            const pow=
                assignFromPool(
                    DUTY_TYPES.POW,
                    date,
                    usedIds,
                    usedDesks,
                    dayInfo.messages
                );

            if(pow){
                dayInfo.assignments.push({
                    slotKey:"pow",
                    label:"Duty POW",
                    person:pow.person,
                    specialDuty:!!pow.specialDuty,
                    specialDutyId:
                        pow.specialDutyId||null
                });
            }

            const pattern=
                BC_PATTERN[
                    weekdayPatternIndex%
                    BC_PATTERN.length
                ];

            const ow=
                assignFromBCGroup(
                    DUTY_TYPES.OFFICEWATCH,
                    date,
                    pattern.ow,
                    usedIds,
                    usedDesks,
                    dayInfo.messages
                );

            if(ow){
                dayInfo.assignments.push({
                    slotKey:"officewatch",
                    label:"Duty OW",
                    person:ow.person,
                    specialDuty:!!ow.specialDuty,
                    specialDutyId:
                        ow.specialDutyId||null
                });
            }

            const op=
                assignFromBCGroup(
                    DUTY_TYPES.OPERATION,
                    date,
                    pattern.operation,
                    usedIds,
                    usedDesks,
                    dayInfo.messages
                );

            if(op){
                dayInfo.assignments.push({
                    slotKey:"operation",
                    label:"Duty Operation",
                    person:op.person,
                    specialDuty:!!op.specialDuty,
                    specialDutyId:
                        op.specialDutyId||null
                });
            }

            const liaison=
                assignFromPool(
                    DUTY_TYPES.LIAISON,
                    date,
                    usedIds,
                    usedDesks,
                    dayInfo.messages
                );

            if(liaison){
                dayInfo.assignments.push({
                    slotKey:"liaison",
                    label:"Duty Liaison",
                    person:liaison.person,
                    specialDuty:!!liaison.specialDuty,
                    specialDutyId:
                        liaison.specialDutyId||null
                });
            }

            weekdayPatternIndex++;
        }else{
            if(
                parseDateKey(date).getDay()===6
            ){
                const ood=
                    assignFromPool(
                        DUTY_TYPES.OOD,
                        date,
                        usedIds,
                        usedDesks,
                        dayInfo.messages
                    );

                if(ood){
                    dayInfo.assignments.push({
                        slotKey:"ood",
                        label:"Duty OOD",
                        person:ood.person,
                        specialDuty:!!ood.specialDuty,
                        specialDutyId:
                            ood.specialDutyId||null
                    });
                }

                const weekendBC=
                    assignWeekendBC(
                        date,
                        usedIds,
                        usedDesks,
                        dayInfo.messages
                    );

                if(weekendBC){
                    dayInfo.assignments.push({
                        slotKey:"weekend-ow-operation",
                        label:"Duty OW/Operation",
                        person:weekendBC.person,
                        specialDuty:!!weekendBC.specialDuty,
                        specialDutyId:
                            weekendBC.specialDutyId||null
                    });
                }

                const liaison=
                    assignWeekendLiaison(
                        date,
                        usedIds,
                        usedDesks,
                        dayInfo.messages
                    );

                if(liaison){
                    dayInfo.assignments.push({
                        slotKey:"liaison",
                        label:"Duty Liaison",
                        person:liaison.person,
                        specialDuty:!!liaison.specialDuty,
                        specialDutyId:
                            liaison.specialDutyId||null
                    });
                }

                weekendBlocks[date]={
                    assignments:
                        dayInfo.assignments.map(
                            a=>({...a})
                        ),
                    messages:[
                        ...dayInfo.messages
                    ]
                };
            }else{
                const saturdayKey=
                    formatDateKey(
                        addDays(
                            parseDateKey(date),
                            -1
                        )
                    );

                const block=
                    weekendBlocks[saturdayKey];

                if(block){
                    dayInfo.assignments=
                        block.assignments.map(
                            a=>({...a})
                        );

                    dayInfo.messages=[
                        ...block.messages
                    ];
                }else{
                    const ood=
                        assignFromPool(
                            DUTY_TYPES.OOD,
                            date,
                            usedIds,
                            usedDesks,
                            dayInfo.messages
                        );

                    if(ood){
                        dayInfo.assignments.push({
                            slotKey:"ood",
                            label:"Duty OOD",
                            person:ood.person,
                            specialDuty:!!ood.specialDuty,
                            specialDutyId:
                                ood.specialDutyId||null
                        });
                    }

                    const weekendBC=
                        assignWeekendBC(
                            date,
                            usedIds,
                            usedDesks,
                            dayInfo.messages
                        );

                    if(weekendBC){
                        dayInfo.assignments.push({
                            slotKey:"weekend-ow-operation",
                            label:"Duty OW/Operation",
                            person:weekendBC.person,
                            specialDuty:!!weekendBC.specialDuty,
                            specialDutyId:
                                weekendBC.specialDutyId||null
                        });
                    }

                    const liaison=
                        assignWeekendLiaison(
                            date,
                            usedIds,
                            usedDesks,
                            dayInfo.messages
                        );

                    if(liaison){
                        dayInfo.assignments.push({
                            slotKey:"liaison",
                            label:"Duty Liaison",
                            person:liaison.person,
                            specialDuty:!!liaison.specialDuty,
                            specialDutyId:
                                liaison.specialDutyId||null
                        });
                    }
                }
            }
        }

        if(visible)
            roster[date]=dayInfo;

        current=
            addDays(current,1);
    }
}

function renderCalendar(){
    if(!calendarEl)
        return;

    calendarEl.innerHTML="";

    if(calendarMonthEl){
        calendarMonthEl.textContent=
            visibleMonth.toLocaleDateString(
                "en-US",
                {
                    month:"long",
                    year:"numeric"
                }
            );
    }

    [
        "SUN",
        "MON",
        "TUE",
        "WED",
        "THU",
        "FRI",
        "SAT"
    ].forEach(day=>{
        const el=
            document.createElement("div");

        el.className="calendar-weekday";
        el.textContent=day;

        calendarEl.appendChild(el);
    });

    const first=getMonthStart();

    const gridStart=
        addDays(
            first,
            -first.getDay()
        );

    const today=
        formatDateKey(new Date());

    const query=
        dutySearch?
            dutySearch.value.trim().toLowerCase():
            "";

    for(let i=0;i<42;i++){
        const date=
            addDays(gridStart,i);

        const dateKey=
            formatDateKey(date);

        const cell=
            document.createElement("div");

        cell.className="calendar-day";

        if(
            date.getMonth()!==
            visibleMonth.getMonth()
        )
            cell.classList.add("other-month");

        if(dateKey===today)
            cell.classList.add("today");

        if(dateKey===selectedDate)
            cell.classList.add("selected");

        const number=
            document.createElement("span");

        number.className="day-number";
        number.textContent=date.getDate();

        cell.appendChild(number);

        if(roster[dateKey]){
            renderDayEntries(
                cell,
                roster[dateKey],
                query,
                dateKey
            );
        }

        cell.addEventListener(
            "click",
            ()=>{
                selectedDate=dateKey;
                renderCalendar();
                renderDutyDetails(dateKey);
            }
        );

        calendarEl.appendChild(cell);
    }

    updateMonthButtons();
}

function renderDayEntries(
    cell,
    dayRoster,
    query,
    dateKey
){
    const assignments=
        dayRoster.assignments;

    const find=k=>
        assignments.find(
            x=>x.slotKey===k
        );

    function add(label,a){
        const name=
            a?
                a.person.full_name_rank:
                "—";

        const special=
            a&&a.specialDuty;

        const text=
            `${label}: ${name}${special?" SPECIAL DUTY":""}`;

        if(
            query&&
            !text.toLowerCase().includes(query)
        )
            return;

        const entry=
            document.createElement("div");

        entry.className="duty-entry";

        entry.innerHTML=
            `<span class="duty-label">${escapeHtml(label)}:</span>`+
            `<span class="duty-person">${escapeHtml(name)}</span>`+
            `${
                special
                    ?`<span class="special-duty-badge" style="margin-left:5px;font-size:9px;font-weight:700;color:#9a6500;">SPECIAL DUTY</span>`
                    :""
            }`;

        cell.appendChild(entry);
    }

    if(isWeekend(dateKey)){
        add("Duty OOD",find("ood"));
        add(
            "Duty OW/Operation",
            find("weekend-ow-operation")
        );
        add("Duty Liaison",find("liaison"));
        return;
    }

    if(
        getEligiblePool(
            DUTY_TYPES.POW,
            dateKey
        ).length||
        find("pow")
    ){
        add("Duty POW",find("pow"));
    }

    add("Duty OW",find("officewatch"));
    add("Duty Operation",find("operation"));
    add("Duty Liaison",find("liaison"));
}

function renderDutyDetails(dateKey){
    if(
        !dutyDetailsContent||
        !dutyStatus
    )
        return;

    const day=
        roster[dateKey];

    if(!day){
        dutyStatus.textContent="—";

        dutyDetailsContent.innerHTML=
            `<p class="empty-details">No roster available for this date.</p>`;

        return;
    }

    dutyStatus.textContent=
        isWeekend(dateKey)
            ?"WEEKEND"
            :"WEEKDAY";

    let html=
        `<p class="detail-date">${escapeHtml(formatLongDate(dateKey))}</p>`;

    const get=k=>
        day.assignments.find(
            x=>x.slotKey===k
        );

    function detailAssignment(label,a){
        html+=detailBlock(
            label,
            a?a.person.full_name_rank:"—"
        );

        if(a&&a.specialDuty){
            html+=
                `<div class="detail-block" style="margin-top:-8px">`+
                `<p class="detail-label" style="color:#9a6500">SPECIAL DUTY</p>`+
                `</div>`;
        }
    }

    if(isWeekend(dateKey)){
        detailAssignment(
            "Duty OOD",
            get("ood")
        );

        detailAssignment(
            "Duty OW/Operation",
            get("weekend-ow-operation")
        );

        detailAssignment(
            "Duty Liaison",
            get("liaison")
        );
    }else{
        const pow=get("pow");

        if(
            getEligiblePool(
                DUTY_TYPES.POW,
                dateKey
            ).length||
            pow
        ){
            detailAssignment(
                "Duty POW",
                pow
            );
        }

        detailAssignment(
            "Duty OW",
            get("officewatch")
        );

        detailAssignment(
            "Duty Operation",
            get("operation")
        );

        detailAssignment(
            "Duty Liaison",
            get("liaison")
        );
    }

    if(day.messages.length){
        html+=
            `<div class="detail-block">`+
            `<p class="detail-label">ROTATION INFORMATION</p>`+
            `${day.messages.map(
                m=>
                    `<p class="detail-value">${escapeHtml(m)}</p>`
            ).join("")}`+
            `</div>`;
    }

    dutyDetailsContent.innerHTML=html;
}

function detailBlock(label,value){
    return`
        <div class="detail-block">
            <p class="detail-label">${escapeHtml(label)}</p>
            <p class="detail-value">${escapeHtml(value)}</p>
        </div>`;
}

function renderSwapInformation(){
    if(!swapInformation)
        return;

    const messages=[];

    Object.entries(roster).forEach(
        ([dateKey,day])=>
            day.messages.forEach(
                message=>
                    messages.push({
                        dateKey,
                        message
                    })
            )
    );

    if(!messages.length){
        swapInformation.innerHTML=
            `<div class="swap-note">No duty swap recorded for this month.</div>`;

        return;
    }

    swapInformation.innerHTML=
        messages.map(
            x=>
                `<div class="swap-note">`+
                `<strong>${escapeHtml(formatLongDate(x.dateKey))}</strong>`+
                `<div>${escapeHtml(x.message)}</div>`+
                `</div>`
        ).join("");
}

function renderExemptionList(){
    if(!exemptionList)
        return;

    if(!exemptions.length){
        exemptionList.innerHTML=
            `<tr><td colspan="6">No exemptions yet.</td></tr>`;

        return;
    }

    exemptionList.innerHTML=
        exemptions.map(e=>{
            const person=
                personnel.find(
                    p=>
                        Number(p.id)===
                        Number(e.personnel_id)
                );

            return`
                <tr>
                    <td>${escapeHtml(person?person.full_name_rank:"Unknown Personnel")}</td>
                    <td>${escapeHtml(e.reason)}</td>
                    <td>${escapeHtml(e.start_date)}</td>
                    <td>${escapeHtml(e.end_date)}</td>
                    <td>
                        <span class="exemption-decision">
                            ${escapeHtml(e.decision||"Next in line")}
                        </span>
                    </td>
                    <td>
                        <button
                            type="button"
                            class="personnel-delete"
                            data-action="delete-exemption"
                            data-id="${escapeHtml(e.id)}">
                            Delete
                        </button>
                    </td>
                </tr>`;
        }).join("");
}

function updateMonthButtons(){
    if(!previousMonthBtn)
        return;

    const current=
        visibleMonth.getFullYear()*12+
        visibleMonth.getMonth();

    const minimum=
        FIRST_MONTH.getFullYear()*12+
        FIRST_MONTH.getMonth();

    previousMonthBtn.disabled=
        current<=minimum;
}

function refreshRoster(){
    buildRoster();

    renderCalendar();
    renderSwapInformation();
    renderExemptionList();

    if(
        selectedDate&&
        roster[selectedDate]
    ){
        renderDutyDetails(selectedDate);
    }
}

async function loadPersonnel(){
    const{data,error}=
        await supabaseClient
            .from("duty_personnel")
            .select(
                "id, serial_number, full_name_rank, duty, desk, created_at"
            );

    if(error){
        console.error(error);

        personnel=[];

        if(personnelList){
            personnelList.innerHTML=
                `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
        }

        return;
    }

    personnel=
        sortPersonnel(
            (data||[]).map(
                p=>({
                    ...p,
                    duty:normalizeDuty(p.duty)
                })
            )
        );

    renderPersonnel();
    populateDutyGeneratorPersonnel();
}

async function loadExemptions(){
    const{data,error}=
        await supabaseClient
            .from("duty_exemptions")
            .select(
                "id, personnel_id, reason, start_date, end_date, decision, created_at"
            )
            .order(
                "start_date",
                {ascending:true}
            );

    if(error){
        console.warn(
            "Exemption loading:",
            error.message
        );

        exemptions=[];

        return;
    }

    exemptions=data||[];
}

async function loadSpecialDuties(){
    const{data,error}=
        await supabaseClient
            .from("duty_special_assignments")
            .select(
                "id, personnel_id, duty_type, start_date, end_date, reason, created_at"
            )
            .order(
                "start_date",
                {ascending:true}
            );

    if(error){
        console.warn(
            "Special Duty loading:",
            error.message
        );

        specialDuties=[];

        return;
    }

    specialDuties=data||[];
}

function renderPersonnel(){
    if(!personnelList)
        return;

    if(!personnel.length){
        personnelList.innerHTML=
            `<tr><td colspan="5">No personnel added yet.</td></tr>`;

        return;
    }

    personnelList.innerHTML=
        personnel.map(
            p=>`
                <tr>
                    <td>${escapeHtml(p.serial_number)}</td>
                    <td>${escapeHtml(p.full_name_rank)}</td>
                    <td>${escapeHtml(getShortDutyLabel(p.duty))}</td>
                    <td>${escapeHtml(p.desk||"—")}</td>
                    <td>
                        <div class="personnel-actions">
                            <button
                                type="button"
                                class="personnel-edit"
                                data-action="edit"
                                data-id="${escapeHtml(p.id)}">
                                Edit
                            </button>
                            <button
                                type="button"
                                class="personnel-edit"
                                data-action="exemption"
                                data-id="${escapeHtml(p.id)}">
                                Exemption
                            </button>
                            <button
                                type="button"
                                class="personnel-edit"
                                data-action="special-duty"
                                data-id="${escapeHtml(p.id)}">
                                Special Duty
                            </button>
                            <button
                                type="button"
                                class="personnel-delete"
                                data-action="delete"
                                data-id="${escapeHtml(p.id)}">
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `
        ).join("");
}

function resetPersonnelForm(){
    editingPersonnelId=null;

    if(personnelForm)
        personnelForm.reset();

    if(savePersonnelBtn)
        savePersonnelBtn.textContent="Save Personnel";

    if(personnelStatus)
        personnelStatus.textContent="";

    ensureDutyOptions();
}

function editPersonnel(id){
    const person=
        personnel.find(
            p=>Number(p.id)===Number(id)
        );

    if(!person)
        return;

    editingPersonnelId=person.id;

    personnelSerial.value=person.serial_number;
    personnelName.value=person.full_name_rank;
    personnelDuty.value=normalizeDuty(person.duty);
    personnelDesk.value=person.desk||"";

    savePersonnelBtn.textContent="Update Personnel";

    personnelForm.classList.remove("hidden");
}

function ensureDutyOptions(){
    if(!personnelDuty)
        return;

    const current=personnelDuty.value;

    personnelDuty.innerHTML=`
        <option value="">Select Duty</option>
        <option value="Duty OOD">Duty OOD</option>
        <option value="Duty POW">Duty POW</option>
        <option value="Duty Officewatch">Duty Officewatch</option>
        <option value="Duty Operation">Duty Operation</option>
        <option value="Duty Liaison">Duty Liaison</option>
        <option value="Duty Officewatch/Operation">Duty OW/OPS</option>
        <option value="Duty Officewatch/Operation/Liaison">Duty OW/OPS/Liaison</option>
    `;

    if(current)
        personnelDuty.value=normalizeDuty(current);
}

function getDutyTypesFromSelection(duty){
    switch(normalizeDuty(duty)){
        case"Duty OOD":
            return[DUTY_TYPES.OOD];
        case"Duty POW":
            return[DUTY_TYPES.POW];
        case"Duty Officewatch":
            return[DUTY_TYPES.OFFICEWATCH];
        case"Duty Operation":
            return[DUTY_TYPES.OPERATION];
        case"Duty Liaison":
            return[DUTY_TYPES.LIAISON];
        case"Duty Officewatch/Operation":
            return[
                DUTY_TYPES.OFFICEWATCH,
                DUTY_TYPES.OPERATION
            ];
        case"Duty Officewatch/Operation/Liaison":
            return[
                DUTY_TYPES.OFFICEWATCH,
                DUTY_TYPES.OPERATION,
                DUTY_TYPES.LIAISON
            ];
        default:
            return[];
    }
}

function validateSerialDuty(serial,duty){
    const types=
        getDutyTypesFromSelection(duty);

    if(!types.length){
        return{
            valid:false,
            message:"Please select a Duty."
        };
    }

    if(
        types.some(
            t=>serialAllowsDuty(serial,t)
        )
    ){
        return{
            valid:true,
            message:""
        };
    }

    return{
        valid:false,
        message:"Serial Number does not match the selected Duty."
    };
}

async function savePersonnel(event){
    event.preventDefault();
    if(!isCg5Admin())return;

    const serial=personnelSerial.value.trim();
    const name=personnelName.value.trim();
    const duty=normalizeDuty(personnelDuty.value);
    const desk=personnelDesk.value;

    if(!serial||!name||!duty||!desk){
        personnelStatus.textContent=
            "Please complete all fields.";

        return;
    }

    const validation=
        validateSerialDuty(
            serial,
            duty
        );

    if(!validation.valid){
        personnelStatus.textContent=
            validation.message;

        return;
    }

    personnelStatus.textContent="Saving...";

    let result;

    if(editingPersonnelId){
        result=
            await supabaseClient
                .from("duty_personnel")
                .update({
                    serial_number:serial,
                    full_name_rank:name,
                    duty,
                    desk
                })
                .eq("id",editingPersonnelId);
    }else{
        result=
            await supabaseClient
                .from("duty_personnel")
                .insert({
                    serial_number:serial,
                    full_name_rank:name,
                    duty,
                    desk
                });
    }

    if(result.error){
        personnelStatus.textContent=
            result.error.message;

        return;
    }

    resetPersonnelForm();

    personnelForm.classList.add("hidden");

    await loadPersonnel();
    await loadExemptions();
    await loadSpecialDuties();

    refreshRoster();
}

async function deletePersonnel(id){
    if(!isCg5Admin())return;
    const person=
        personnel.find(
            p=>Number(p.id)===Number(id)
        );

    if(!person)
        return;

    if(
        !window.confirm(
            `Delete ${person.full_name_rank}?`
        )
    )
        return;

    const{error}=
        await supabaseClient
            .from("duty_personnel")
            .delete()
            .eq("id",id);

    if(error){
        alert(error.message);
        return;
    }

    await loadPersonnel();
    await loadExemptions();
    await loadSpecialDuties();

    refreshRoster();
}

function openExemption(id){
    const person=
        personnel.find(
            p=>Number(p.id)===Number(id)
        );

    if(!person||!exemptionModal)
        return;

    exemptionPersonnelId=person.id;
    exemptionPersonnel.value=person.full_name_rank;
    exemptionReason.value="";
    exemptionStart.value="";
    exemptionEnd.value="";
    exemptionDecision.value="Next in line";
    exemptionStatus.textContent="";

    exemptionModal.classList.remove("hidden");
}

function closeExemptionModal(){
    exemptionPersonnelId=null;

    if(exemptionModal)
        exemptionModal.classList.add("hidden");
}

async function saveExemption(){
    if(!isCg5Admin())return;
    if(!exemptionPersonnelId)
        return;

    const reason=exemptionReason.value.trim();
    const startDate=exemptionStart.value;
    const endDate=exemptionEnd.value;
    const decision=
        exemptionDecision.value||
        "Next in line";

    if(!reason||!startDate||!endDate){
        exemptionStatus.textContent=
            "Please complete all exemption fields.";

        return;
    }

    const{error}=
        await supabaseClient
            .from("duty_exemptions")
            .insert({
                personnel_id:exemptionPersonnelId,
                reason,
                start_date:startDate,
                end_date:endDate,
                decision
            });

    if(error){
        exemptionStatus.textContent=
            error.message;

        return;
    }

    closeExemptionModal();

    await loadExemptions();

    refreshRoster();
}

async function deleteExemption(id){
    if(!isCg5Admin())return;
    if(
        !window.confirm(
            "Delete this exemption?"
        )
    )
        return;

    const{error}=
        await supabaseClient
            .from("duty_exemptions")
            .delete()
            .eq("id",id);

    if(error){
        alert(error.message);
        return;
    }

    await loadExemptions();

    refreshRoster();
}

function createSpecialDutyModal(){
    if($("special-duty-modal"))
        return;

    const modal=document.createElement("div");

    modal.id="special-duty-modal";
    modal.className="modal hidden";

    modal.innerHTML=`
        <div class="modal-backdrop"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>Special Duty</h3>
                <button type="button" id="close-special-duty">×</button>
            </div>

            <div class="modal-body">
                <div class="form-group">
                    <label>Personnel</label>
                    <input type="text" id="special-duty-personnel" readonly>
                </div>

                <div class="form-group">
                    <label>Duty Type</label>
                    <select id="special-duty-type">
                        <option value="">Select Duty</option>
                        <option value="OOD">Duty OOD</option>
                        <option value="POW">Duty POW</option>
                        <option value="Officewatch">Duty OW</option>
                        <option value="Operation">Duty Operation</option>
                        <option value="Liaison">Duty Liaison</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Start Date</label>
                    <input type="date" id="special-duty-start">
                </div>

                <div class="form-group">
                    <label>End Date</label>
                    <input type="date" id="special-duty-end">
                </div>

                <div class="form-group">
                    <label>Reason</label>
                    <textarea id="special-duty-reason" rows="3" placeholder="Optional"></textarea>
                </div>

                <div id="special-duty-status" class="form-status"></div>
                <div id="special-duty-existing" class="special-duty-existing"></div>
            </div>

            <div class="modal-footer">
                <button type="button" id="cancel-special-duty">Cancel</button>
                <button type="button" id="save-special-duty" data-admin-only>Save Special Duty</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    on(
        $("close-special-duty"),
        "click",
        closeSpecialDutyModal
    );

    on(
        $("cancel-special-duty"),
        "click",
        closeSpecialDutyModal
    );

    on(
        $("save-special-duty"),
        "click",
        saveSpecialDuty
    );

    on(
        modal.querySelector(".modal-backdrop"),
        "click",
        closeSpecialDutyModal
    );

    on(
        modal,
        "click",
        event=>{
            const button=
                event.target.closest(
                    "button[data-special-delete]"
                );

            if(button)
                deleteSpecialDuty(
                    button.dataset.specialDelete
                );
        }
    );
}

function openSpecialDuty(id){
    const person=
        personnel.find(
            p=>Number(p.id)===Number(id)
        );

    if(!person)
        return;

    createSpecialDutyModal();

    specialDutyPersonnelId=person.id;
    editingSpecialDutyId=null;

    $("special-duty-personnel").value=
        person.full_name_rank;

    $("special-duty-type").value="";
    $("special-duty-start").value="";
    $("special-duty-end").value="";
    $("special-duty-reason").value="";
    $("special-duty-status").textContent="";

    renderExistingSpecialDuties();

    $("special-duty-modal").classList.remove("hidden");
}

function closeSpecialDutyModal(){
    specialDutyPersonnelId=null;
    editingSpecialDutyId=null;

    const modal=
        $("special-duty-modal");

    if(modal)
        modal.classList.add("hidden");
}

function renderExistingSpecialDuties(){
    const container=
        $("special-duty-existing");

    if(
        !container||
        !specialDutyPersonnelId
    )
        return;

    const list=
        specialDuties.filter(
            x=>
                Number(x.personnel_id)===
                Number(specialDutyPersonnelId)
        );

    if(!list.length){
        container.innerHTML=
            "<p>No existing Special Duty.</p>";

        return;
    }

    container.innerHTML=`
        <div class="special-duty-existing-title">
            Existing Special Duty
        </div>

        ${list.map(
            x=>`
                <div class="special-duty-existing-item">
                    <div>
                        <strong>
                            ${escapeHtml(x.duty_type)}
                        </strong>
                        <br>
                        ${escapeHtml(x.start_date)}
                        →
                        ${escapeHtml(x.end_date)}
                    </div>

                    <button
                        type="button"
                        class="personnel-delete"
                        data-special-delete="${escapeHtml(x.id)}">
                        Delete
                    </button>
                </div>
            `
        ).join("")}
    `;
}

async function saveSpecialDuty(){
    if(!isCg5Admin())return;
    if(!specialDutyPersonnelId)
        return;

    const dutyType=
        $("special-duty-type").value;

    const startDate=
        $("special-duty-start").value;

    const endDate=
        $("special-duty-end").value;

    const reason=
        $("special-duty-reason")
            .value
            .trim();

    const status=
        $("special-duty-status");

    if(!dutyType||!startDate||!endDate){
        status.textContent=
            "Please complete Duty Type, Start Date and End Date.";

        return;
    }

    status.textContent="Saving...";

    const payload={
        personnel_id:specialDutyPersonnelId,
        duty_type:dutyType,
        start_date:startDate,
        end_date:endDate,
        reason:reason||null
    };

    const{error}=
        await supabaseClient
            .from("duty_special_assignments")
            .insert(payload);

    if(error){
        status.textContent=
            error.message;

        return;
    }

    await loadSpecialDuties();

    closeSpecialDutyModal();

    refreshRoster();
}

async function deleteSpecialDuty(id){
    if(!isCg5Admin())return;
    if(
        !window.confirm(
            "Delete this Special Duty assignment?"
        )
    )
        return;

    const{error}=
        await supabaseClient
            .from("duty_special_assignments")
            .delete()
            .eq("id",id);

    if(error){
        alert(error.message);
        return;
    }

    await loadSpecialDuties();

    renderExistingSpecialDuties();

    refreshRoster();
}

function getGeneratorPool(type,date){
    return sortPersonnel(
        personnel.filter(person=>{
            if(!personnelActiveOnDate(person,date))
                return false;

            if(!serialAllowsDuty(person.serial_number,type))
                return false;

            if(type===DUTY_TYPES.OOD)
                return true;

            return dutySelectionAllowsDuty(
                person.duty,
                type
            );
        })
    );
}

function getGeneratorRangePool(type,date,setName=generatorRangeSet){
    const key=
        type===DUTY_TYPES.OFFICEWATCH?
            "officewatch":
        type===DUTY_TYPES.OPERATION?
            "operation":
        "";

    const range=
        GENERATOR_RANGE_SETS[setName]?.[key];

    if(!range)
        return[];

    const from=Number(range.from);
    const to=Number(range.to);

    return getGeneratorPool(type,date).filter(person=>{
        const serial=getNumericSerial(person.serial_number);

        return serial!==null&&serial<=from&&serial>=to;
    });
}

function updateGeneratorRangeControls(){
    const descriptions={
        A:"Set A — Officewatch: Ismael to Cayacap; Operation: Yungco to Cayacap.",
        B:"Set B — Officewatch: Yungco to Cayacap; Operation: Ismael to Cayacap."
    };

    document.querySelectorAll("[data-generator-range-set]").forEach(button=>{
        const active=button.dataset.generatorRangeSet===generatorRangeSet;

        button.setAttribute("aria-pressed",String(active));
        button.classList.toggle("primary-button",active);
        button.classList.toggle("secondary-button",!active);
    });

    const description=$("generator-range-description");

    if(description)
        description.textContent=descriptions[generatorRangeSet];
}

function selectGeneratorRangeSet(setName){
    if(!GENERATOR_RANGE_SETS[setName])
        return;

    generatorRangeSet=setName;

    try{
        localStorage.setItem(
            GENERATOR_RANGE_SET_KEY,
            generatorRangeSet
        );
    }catch(error){}

    updateGeneratorRangeControls();
    generatedDutyRotation=null;

    const preview=$("generator-preview");
    const applyButton=$("apply-rotation-btn");

    if(preview)
        preview.classList.remove("visible");

    if(applyButton)
        applyButton.disabled=true;

    populateDutyGeneratorPersonnel();
}

function getGeneratorPerson(selectId){
    const select=$(selectId);

    if(!select||!select.value)
        return null;

    return findPersonById(select.value);
}

function fillGeneratorSelect(selectId,list,currentValue){
    const select=$(selectId);

    if(!select)
        return;

    select.innerHTML=
        `<option value="">Select Personnel</option>`;

    list.forEach(person=>{
        const option=
            document.createElement("option");

        option.value=person.id;

        option.textContent=
            `${person.serial_number} — ${person.full_name_rank}`;

        select.appendChild(option);
    });

    if(
        currentValue&&
        list.some(
            person=>
                String(person.id)===String(currentValue)
        )
    ){
        select.value=currentValue;
    }else if(list.length){
        select.value=String(list[0].id);
    }
}

function populateDutyGeneratorPersonnel(){
    const startDate=
        $("generator-start-date")?.value||
        formatDateKey(new Date());

    const selections=[
        "generator-pow",
        "generator-officewatch",
        "generator-operation",
        "generator-liaison",
        "generator-ood",
        "generator-weekend-ow",
        "generator-weekend-liaison"
    ];

    const oldValues={};

    selections.forEach(id=>{
        oldValues[id]=$(id)?.value||"";
    });

    fillGeneratorSelect(
        "generator-pow",
        getGeneratorPool(
            DUTY_TYPES.POW,
            startDate
        ),
        oldValues["generator-pow"]
    );

    fillGeneratorSelect(
        "generator-officewatch",
        getGeneratorRangePool(
            DUTY_TYPES.OFFICEWATCH,
            startDate
        ),
        oldValues["generator-officewatch"]
    );

    fillGeneratorSelect(
        "generator-operation",
        getGeneratorRangePool(
            DUTY_TYPES.OPERATION,
            startDate
        ),
        oldValues["generator-operation"]
    );

    fillGeneratorSelect(
        "generator-liaison",
        getGeneratorPool(
            DUTY_TYPES.LIAISON,
            startDate
        ),
        oldValues["generator-liaison"]
    );

    fillGeneratorSelect(
        "generator-ood",
        getGeneratorPool(
            DUTY_TYPES.OOD,
            startDate
        ),
        oldValues["generator-ood"]
    );

    fillGeneratorSelect(
        "generator-weekend-ow",
        getGeneratorRangePool(
            DUTY_TYPES.OFFICEWATCH,
            startDate
        ),
        oldValues["generator-weekend-ow"]
    );

    fillGeneratorSelect(
        "generator-weekend-liaison",
        getGeneratorWeekendLiaisonPool(startDate),
        oldValues["generator-weekend-liaison"]
    );
}



function normalizeDesk(desk){
    return String(desk||"")
        .trim()
        .toUpperCase();
}

function canUseGeneratorDesk(person,deskCounts){
    if(!person)
        return false;

    const desk=normalizeDesk(person.desk);

    if(!desk)
        return true;

    return (deskCounts.get(desk)||0)<2;
}

function addGeneratorDesk(person,deskCounts){
    if(!person)
        return;

    const desk=normalizeDesk(person.desk);

    if(!desk)
        return;

    deskCounts.set(
        desk,
        (deskCounts.get(desk)||0)+1
    );
}

function getNextGeneratorPersonAvailable(
    pool,
    currentPerson,
    usedIds,
    deskCounts
){
    if(!pool.length)
        return null;

    const currentIndex=
        pool.findIndex(
            person=>
                Number(person.id)===
                Number(currentPerson?.id)
        );

    const startIndex=
        currentIndex<0?
            0:
            currentIndex;

    for(
        let step=0;
        step<pool.length;
        step++
    ){
        const person=
            pool[
                (startIndex+step)%pool.length
            ];

        if(!person)
            continue;

        if(
            usedIds.has(
                Number(person.id)
            )
        )
            continue;

        if(
            !canUseGeneratorDesk(
                person,
                deskCounts
            )
        )
            continue;

        return person;
    }

    return null;
}

function getGeneratorDeskCounts(day){
    const counts=new Map();

    (day?.assignments||[]).forEach(assignment=>{
        const desk=normalizeDesk(assignment.person?.desk);

        if(desk)
            counts.set(desk,(counts.get(desk)||0)+1);
    });

    return counts;
}

function generatorDayWithinDeskLimit(day){
    return[...getGeneratorDeskCounts(day).values()].every(count=>count<=2);
}

function generatorDayHasUniquePersonnel(day){
    const ids=(day?.assignments||[])
        .map(assignment=>Number(assignment.personnel_id))
        .filter(Number.isFinite);

    return new Set(ids).size===ids.length;
}

function generatorDayIsValid(day){
    return generatorDayWithinDeskLimit(day)&&
        generatorDayHasUniquePersonnel(day);
}

function getGeneratorSwapPool(slotKey){
    const pools=generatorPools||{};

    if(slotKey==="officewatch")
        return pools.officewatch||[];

    if(slotKey==="operation")
        return pools.operation||[];

    if(slotKey==="weekend-ow-operation")
        return pools.weekendOW||[];

    return[];
}

function syncGeneratorWeekendMirror(date,slotKey,person){
    if(!isWeekend(date))
        return;

    const keyDate=parseDateKey(date);
    const mirrorDate=keyDate.getDay()===6?
        formatDateKey(addDays(keyDate,1)):
        formatDateKey(addDays(keyDate,-1));
    const mirrorDay=generatedDutyRotation?.[mirrorDate];

    const mirror=mirrorDay?.assignments.find(
        assignment=>assignment.slotKey===slotKey
    );

    if(mirror){
        mirror.personnel_id=person.id;
        mirror.person=person;
    }
}

function balanceGeneratorDeskAssignments(){
    const dates=Object.keys(generatedDutyRotation||{}).sort();
    const mutableSlots=new Set([
        "officewatch",
        "operation",
        "weekend-ow-operation"
    ]);
    let swaps=0;

    dates.forEach(date=>{
        generatedDutyRotation[date].notes=[];
    });

    for(let pass=0;pass<dates.length*4;pass++){
        let changed=false;

        for(const date of dates){
            const day=generatedDutyRotation[date];

            if(generatorDayIsValid(day))
                continue;

            const ownMutable=day.assignments.filter(
                assignment=>mutableSlots.has(assignment.slotKey)
            );

            for(const own of ownMutable){
                const sameSlotDates=dates
                    .filter(otherDate=>otherDate!==date)
                    .filter(otherDate=>{
                        const delta=Math.abs(
                            (parseDateKey(otherDate)-parseDateKey(date))/86400000
                        );
                        const sameWeekendType=
                            own.slotKey==="weekend-ow-operation"?
                                isWeekend(otherDate)&&parseDateKey(otherDate).getDay()===6:
                                !isWeekend(otherDate);

                        return delta<=7&&sameWeekendType;
                    })
                    .sort((a,b)=>
                        Math.abs((parseDateKey(a)-parseDateKey(date))/86400000)-
                        Math.abs((parseDateKey(b)-parseDateKey(date))/86400000)
                    );

                let foundSwap=false;

                for(const otherDate of sameSlotDates){
                    const otherDay=generatedDutyRotation[otherDate];
                    const other=otherDay.assignments.find(
                        assignment=>assignment.slotKey===own.slotKey
                    );

                    if(!other)
                        continue;

                    const ownPool=getGeneratorSwapPool(own.slotKey);
                    const otherPool=getGeneratorSwapPool(other.slotKey);
                    const ownPerson=own.person;
                    const otherPerson=other.person;

                    if(
                        !ownPool.some(person=>Number(person.id)===Number(otherPerson.id))||
                        !otherPool.some(person=>Number(person.id)===Number(ownPerson.id))
                    )
                        continue;

                    own.person=otherPerson;
                    own.personnel_id=otherPerson.id;
                    other.person=ownPerson;
                    other.personnel_id=ownPerson.id;

                    const valid=
                        generatorDayIsValid(day)&&
                        generatorDayIsValid(otherDay);

                    if(valid){
                        const label=own.slotKey==="officewatch"?
                            "Officewatch":
                            own.slotKey==="operation"?
                                "Operation":
                                "Weekend OW/Operation";
                        const message=`Automatic ${label} duty swap with ${otherDate} to keep the Desk limit and rotation balanced.`;

                        day.notes.push(message);
                        otherDay.notes.push(message);
                        syncGeneratorWeekendMirror(date,own.slotKey,own.person);
                        syncGeneratorWeekendMirror(otherDate,other.slotKey,other.person);
                        swaps++;
                        changed=true;
                        foundSwap=true;
                        break;
                    }

                    own.person=ownPerson;
                    own.personnel_id=ownPerson.id;
                    other.person=otherPerson;
                    other.personnel_id=otherPerson.id;
                }

                if(foundSwap)
                    break;
            }
        }

        if(!changed)
            break;
    }

    let unresolved=0;

    dates.forEach(date=>{
        const day=generatedDutyRotation[date];

        if(generatorDayIsValid(day))
            return;

        const conflicts=[...getGeneratorDeskCounts(day)]
            .filter(([,count])=>count>2)
            .map(([desk,count])=>`${desk} (${count})`);
        const duplicate=generatorDayHasUniquePersonnel(day)?"":" A personnel member is also assigned to another slot.";

        day.notes.push(
            `Desk limit could not be met for ${conflicts.join(", ")||"a same-day assignment conflict"} without changing the fixed POW/Liaison rotation.${duplicate} Please review this day.`
        );
        unresolved++;
    });

    return{swaps,unresolved};
}

function generateDutyRotation(){
    if(!isCg5Admin())return;
    const status=$("generator-status");
    const preview=$("generator-preview");
    const applyButton=$("apply-rotation-btn");

    const startDate=
        $("generator-start-date")?.value;

    const days=
        Number(
            $("generator-days")?.value||0
        );

    if(!startDate){
        if(status)
            status.textContent=
                "Please select the Starting Date.";

        return;
    }

    if(!days||days<1){
        if(status)
            status.textContent=
                "Please enter the Number of Days.";

        return;
    }

    const starts={
        pow:getGeneratorPerson("generator-pow"),
        officewatch:getGeneratorPerson("generator-officewatch"),
        operation:getGeneratorPerson("generator-operation"),
        liaison:getGeneratorPerson("generator-liaison"),
        ood:getGeneratorPerson("generator-ood"),
        weekendOW:getGeneratorPerson("generator-weekend-ow"),
        weekendLiaison:getGeneratorPerson("generator-weekend-liaison")
    };

    const required=[
        ["POW",starts.pow],
        ["Office Watch",starts.officewatch],
        ["Operation",starts.operation],
        ["Liaison",starts.liaison]
    ];

    const missing=
        required
            .filter(item=>!item[1])
            .map(item=>item[0]);

    if(missing.length){
        if(status)
            status.textContent=
                `Please select starting personnel for: ${missing.join(", ")}.`;

        return;
    }

    const pools={
        pow:getGeneratorPool(
            DUTY_TYPES.POW,
            startDate
        ),
        officewatch:getGeneratorRangePool(
            DUTY_TYPES.OFFICEWATCH,
            startDate
        ),
        operation:getGeneratorRangePool(
            DUTY_TYPES.OPERATION,
            startDate
        ),
        liaison:getGeneratorPool(
            DUTY_TYPES.LIAISON,
            startDate
        ),
        weekendLiaison:getGeneratorWeekendLiaisonPool(
            startDate
        ),
        ood:getGeneratorPool(
            DUTY_TYPES.OOD,
            startDate
        ),
        weekendOW:getGeneratorRangePool(
            DUTY_TYPES.OFFICEWATCH,
            startDate
        )
    };

    generatorPools=pools;

    if(!pools.pow.length){
        status.textContent=
            "No eligible POW personnel found.";
        return;
    }

    if(!pools.officewatch.length){
        status.textContent=
            "No eligible Office Watch personnel found.";
        return;
    }

    if(!pools.operation.length){
        status.textContent=
            "No eligible Operation personnel found.";
        return;
    }

    if(!pools.liaison.length){
        status.textContent=
            "No eligible Liaison personnel found.";
        return;
    }

    generatedDutyRotation={};

    let powCurrent=starts.pow;
    let officewatchCurrent=starts.officewatch;
    let operationCurrent=starts.operation;
    let liaisonCurrent=starts.liaison;
    let oodCurrent=starts.ood;
    let weekendOWCurrent=
        starts.weekendOW||
        starts.officewatch;

    let weekendLiaisonCurrent=
        starts.weekendLiaison||
        starts.liaison;

    let current=
        parseDateKey(startDate);

    const poolIndex=pool=>(
        person=>{
            if(!person)
                return-1;

            return pool.findIndex(
                x=>Number(x.id)===Number(person.id)
            );
        }
    );

    const nextFrom=
        (pool,currentPerson)=>{
            if(!pool.length)
                return null;

            const index=
                poolIndex(pool)(currentPerson);

            return pool[
                index<0?
                    0:
                    (index+1)%pool.length
            ];
        };

    const pickNextFromPool=(
        pool,
        currentPerson,
        usedIds,
        nextPerson
    )=>{
        const person=
            getNextGeneratorPersonAvailable(
                pool,
                currentPerson,
                usedIds,
                new Map()
            );

        if(person)
            nextPerson(person);

        return person;
    };

    let weekendBlock=null;
    let weekendBlockDate="";

    for(
        let dayIndex=0;
        dayIndex<days;
        dayIndex++
    ){
        const date=
            formatDateKey(current);

        const weekend=
            isWeekend(date);

        const assignments=[];
        const usedIds=new Set();
        const deskCounts=new Map();

        if(!weekend){
            const addAssignment=(
                slotKey,
                label,
                person
            )=>{
                if(!person)
                    return;

                usedIds.add(
                    Number(person.id)
                );

                addGeneratorDesk(
                    person,
                    deskCounts
                );

                assignments.push({
                    date,
                    slotKey,
                    label,
                    personnel_id:person.id,
                    person
                });
            };

            const pow=
                getNextGeneratorPersonAvailable(
                    pools.pow,
                    powCurrent,
                    usedIds,
                    deskCounts
                );

            powCurrent=
                nextFrom(
                    pools.pow,
                    pow||powCurrent
                );

            addAssignment(
                "pow",
                "Duty POW",
                pow
            );

            addAssignment(
                "officewatch",
                "Duty OW",
                pickNextFromPool(
                    pools.officewatch,
                    officewatchCurrent,
                    new Set(),
                    person=>{
                        officewatchCurrent=nextFrom(pools.officewatch,person);
                    }
                )
            );

            addAssignment(
                "operation",
                "Duty Operation",
                pickNextFromPool(
                    pools.operation,
                    operationCurrent,
                    new Set(),
                    person=>{
                        operationCurrent=nextFrom(pools.operation,person);
                    }
                )
            );

            const liaison=
                getNextGeneratorPersonAvailable(
                    pools.liaison,
                    liaisonCurrent,
                    usedIds,
                    deskCounts
                );

            liaisonCurrent=
                nextFrom(
                    pools.liaison,
                    liaison||liaisonCurrent
                );

            addAssignment(
                "liaison",
                "Duty Liaison",
                liaison
            );

        }else{
            const saturdayKey=
                formatDateKey(
                    addDays(current,-1)
                );

            if(
                current.getDay()===0&&
                weekendBlock&&
                weekendBlockDate===saturdayKey
            ){
                // Sunday repeats Saturday's weekend duty.
                weekendBlock.forEach(item=>{
                    assignments.push({
                        ...item,
                        date
                    });
                });
            }else{
                const block=[];
                const weekendUsed=new Set();

                if(oodCurrent){
                    weekendUsed.add(
                        Number(oodCurrent.id)
                    );

                    block.push({
                        date,
                        slotKey:"ood",
                        label:"Duty OOD",
                        personnel_id:oodCurrent.id,
                        person:oodCurrent
                    });

                    oodCurrent=
                        nextFrom(
                            pools.ood,
                            oodCurrent
                        );
                }

                let weekendOW=
                    pickNextFromPool(
                        pools.weekendOW,
                        weekendOWCurrent,
                        new Set(),
                        person=>{
                            weekendOWCurrent=nextFrom(pools.weekendOW,person);
                        }
                    );

                if(weekendOW){
                    weekendUsed.add(
                        Number(weekendOW.id)
                    );

                    block.push({
                        date,
                        slotKey:"weekend-ow-operation",
                        label:"Duty OW/Operation",
                        personnel_id:weekendOW.id,
                        person:weekendOW
                    });
                }

                const weekendLiaison=
                    getNextGeneratorPersonAvailable(
                        pools.weekendLiaison,
                        weekendLiaisonCurrent,
                        weekendUsed,
                        new Map()
                    );

                weekendLiaisonCurrent=
                    nextFrom(
                        pools.weekendLiaison,
                        weekendLiaison||weekendLiaisonCurrent
                    );

                if(weekendLiaison){
                    block.push({
                        date,
                        slotKey:"liaison",
                        label:"Duty Liaison",
                        personnel_id:weekendLiaison.id,
                        person:weekendLiaison
                    });
                }

                weekendBlock=block;
                weekendBlockDate=date;

                block.forEach(item=>{
                    assignments.push({...item});
                });
            }
        }

        generatedDutyRotation[date]={
            date,
            weekend,
            assignments,
            notes:[]
        };

        current=
            addDays(current,1);
    }

    const swapSummary=balanceGeneratorDeskAssignments();

    renderGeneratedDutyRotationPreview();

    if(applyButton){
        applyButton.disabled=swapSummary.unresolved>0;
        applyButton.classList.add(
            "cg5-generator-primary"
        );
    }

    if(status){
        status.className=
            swapSummary.unresolved?
                "cg5-generator-status warning":
                "cg5-generator-status success";

        status.innerHTML=
            `<span class="cg5-status-dot"></span> Rotation generated successfully for <strong>${days}</strong> day(s). Set ${escapeHtml(generatorRangeSet)} is active. Automatic swaps: <strong>${swapSummary.swaps}</strong>.${swapSummary.unresolved?` Review the notes below for Desk conflicts that could not be fixed automatically.`:""}`;
    }
}

function getGeneratorSlotPool(assignment,date){
    const pools=generatorPools||{};

    switch(assignment?.slotKey){
        case"pow":
            return pools.pow||[];

        case"officewatch":
            return pools.officewatch||[];

        case"operation":
            return pools.operation||[];

        case"liaison":
            if(isWeekend(date))
                return pools.weekendLiaison||[];

            return pools.liaison||[];

        case"ood":
            return pools.ood||[];

        case"weekend-ow-operation":
            return pools.weekendOW||[];

        default:
            return[];
    }
}

function onGeneratorAssignmentChange(event){
    const select=
        event.target.closest(
            "select.cg5-generator-swap"
        );

    if(!select)
        return;

    const date=select.dataset.date;
    const index=Number(select.dataset.index);
    const day=generatedDutyRotation?.[date];

    if(!day)
        return;

    const assignment=day.assignments[index];

    if(!assignment)
        return;

    const pool=getGeneratorSlotPool(
        assignment,
        date
    );

    const person=pool.find(
        p=>Number(p.id)===Number(select.value)
    );

    if(!person)
        return;

    assignment.personnel_id=person.id;
    assignment.person=person;

    // Weekend duties are handled as a Saturday/Sunday block;
    // keep Sunday in sync when Saturday is edited.
    const nextKey=formatDateKey(
        addDays(parseDateKey(date),1)
    );

    const nextDay=generatedDutyRotation?.[nextKey];

    if(nextDay&&isWeekend(nextKey)){
        const mirror=nextDay.assignments.find(
            a=>a.slotKey===assignment.slotKey
        );

        if(mirror){
            mirror.personnel_id=person.id;
            mirror.person=person;
        }
    }

    syncGeneratorWeekendMirror(date,assignment.slotKey,person);

    const summary=balanceGeneratorDeskAssignments();
    renderGeneratedDutyRotationPreview();

    const applyButton=$("apply-rotation-btn");
    if(applyButton)
        applyButton.disabled=summary.unresolved>0;

    const status=$("generator-status");
    if(status){
        status.className=summary.unresolved?
            "cg5-generator-status warning":
            "cg5-generator-status success";
        status.textContent=summary.unresolved?
            "May Desk o same-day assignment conflict pa. Tingnan ang notes sa preview bago i-apply.":
            `Rotation ready. Automatic swaps: ${summary.swaps}.`;
    }
}

function renderGeneratedDutyRotationPreview(){
    const preview=$("generator-preview");
    const content=$("generator-preview-content");

    if(!preview||!content)
        return;

    const dates=
        Object.keys(
            generatedDutyRotation||{}
        );

    if(!dates.length){
        content.innerHTML=`
            <div class="cg5-generator-empty">
                <div class="cg5-generator-empty-icon">◎</div>
                <div>No rotation generated yet.</div>
            </div>
        `;

        preview.classList.remove("hidden");
        preview.classList.add("visible");

        return;
    }

    content.innerHTML=
        dates.map(date=>{
            const day=
                generatedDutyRotation[date];

            const rows=
                day.assignments.map(
                    (assignment,assignmentIndex)=>{
                        const slotClass=
                            assignment.slotKey==="pow"
                                ?"pow":
                            assignment.slotKey==="officewatch"
                                ?"ow":
                            assignment.slotKey==="operation"
                                ?"operation":
                            assignment.slotKey==="liaison"
                                ?"liaison":
                            assignment.slotKey==="ood"
                                ?"ood":
                            "weekend";

                        const pool=getGeneratorSlotPool(
                            assignment,
                            date
                        );

                        const options=pool.map(
                            person=>{
                                const selected=
                                    Number(person.id)===
                                    Number(assignment.personnel_id);

                                return`<option value="${escapeHtml(person.id)}"${selected?" selected":""}>${escapeHtml(person.serial_number)} — ${escapeHtml(person.full_name_rank)}</option>`;
                            }
                        ).join("");

                        return`
                            <div class="cg5-generator-assignment">
                                <div class="cg5-generator-duty-tag ${slotClass}">
                                    ${escapeHtml(assignment.label)}
                                </div>

                                <div class="cg5-generator-assignee">
                                    <span class="cg5-generator-serial">
                                        ${escapeHtml(assignment.person.serial_number)}
                                    </span>

                                    <span class="cg5-generator-name">
                                        ${escapeHtml(assignment.person.full_name_rank)}
                                    </span>
                                </div>

                                <div class="cg5-generator-swap-wrap">
                                    <select
                                        class="cg5-generator-swap"
                                        data-date="${escapeHtml(date)}"
                                        data-index="${assignmentIndex}">
                                        ${options}
                                    </select>
                                </div>
                            </div>
                        `;
                    }
                ).join("");

            return`
                <div class="cg5-generator-day">
                    <div class="cg5-generator-day-header">
                        <div>
                            <div class="cg5-generator-day-date">
                                ${escapeHtml(formatLongDate(date))}
                            </div>

                            <div class="cg5-generator-day-key">
                                ${escapeHtml(date)}
                            </div>
                        </div>

                        <span class="cg5-generator-day-type ${day.weekend?"weekend":"weekday"}">
                            ${day.weekend?"WEEKEND":"WEEKDAY"}
                        </span>
                    </div>

                    <div class="cg5-generator-assignments">
                        ${rows||`
                            <div class="cg5-generator-no-duty">
                                No duty assignment.
                            </div>
                        `}
                    </div>
                    ${(day.notes||[]).map(note=>`
                        <p class="generator-duty-note">${escapeHtml(note)}</p>
                    `).join("")}
                </div>
            `;
        }).join("");

    preview.classList.remove("hidden");
    preview.classList.add("visible");
}

async function applyDutyRotation(){
    if(!isCg5Admin())return;
    if(
        !generatedDutyRotation||
        !Object.keys(generatedDutyRotation).length
    )
        return;

    const config={
        startDate:
            $("generator-start-date")?.value||"",
        days:
            Number(
                $("generator-days")?.value||0
            ),
        pow:
            $("generator-pow")?.value||"",
        officewatch:
            $("generator-officewatch")?.value||"",
        operation:
            $("generator-operation")?.value||"",
        liaison:
            $("generator-liaison")?.value||"",
        ood:
            $("generator-ood")?.value||"",
        weekendOW:
            $("generator-weekend-ow")?.value||"",
        weekendLiaison:
            $("generator-weekend-liaison")?.value||"",
        rangeSet:generatorRangeSet,
        appliedAt:
            new Date().toISOString()
    };

    const status=$("generator-status");
    if(status){
        status.className="cg5-generator-status";
        status.textContent="Saving duty rotation for all users...";
    }

    const{error}=await supabaseClient
        .from("duty_rotation_state")
        .upsert({
            id:1,
            config,
            roster:generatedDutyRotation,
            updated_at:new Date().toISOString(),
            updated_by:window.cg5Access?.user?.id||null
        },{onConflict:"id"});

    if(error){
        console.error("Shared duty rotation save failed:",error);
        if(status){
            status.className="cg5-generator-status error";
            status.textContent="Hindi na-save sa shared database. Patakbuhin muna ang updated supabase-admin-status.sql sa Supabase.";
        }
        return;
    }

    localStorage.setItem(APPLIED_ROTATION_CONFIG_KEY,JSON.stringify(config));
    localStorage.setItem(APPLIED_ROTATION_ROSTER_KEY,JSON.stringify(generatedDutyRotation));

    refreshRoster();

    if(status){
        status.className=
            "cg5-generator-status success";

        status.innerHTML=
            `<span class="cg5-status-dot"></span> Duty Rotation successfully applied to the Calendar.`;
    }

    setTimeout(
        closeDutyGenerator,
        650
    );
}

function injectDutyGeneratorStyles(){
    if($("cg5-duty-generator-styles"))
        return;

    const style=
        document.createElement("style");

    style.id="cg5-duty-generator-styles";

    style.textContent=`
        #generate-duty-btn.cg5-generator-launch{
            position:relative;
            overflow:hidden;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            gap:10px;
            flex-shrink:0;
            align-self:center;
            height:42px;
            min-width:200px;
            padding:0 18px 0 10px;
            margin-left:10px;
            border:1px solid rgba(255,255,255,.22);
            border-radius:12px;
            background:
                linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 55%),
                linear-gradient(135deg,#064e5c 0%,#087d78 100%);
            color:#fff;
            font-family:inherit;
            font-size:12.5px;
            font-weight:800;
            letter-spacing:.2px;
            white-space:nowrap;
            cursor:pointer;
            box-shadow:
                inset 0 1px 0 rgba(255,255,255,.25),
                0 1px 2px rgba(3,45,55,.25),
                0 6px 16px rgba(3,45,55,.20);
            transition:
                transform .18s ease,
                box-shadow .18s ease,
                filter .18s ease;
        }

        #generate-duty-btn.cg5-generator-launch::after{
            content:"";
            position:absolute;
            top:0;
            left:-60%;
            width:40%;
            height:100%;
            background:linear-gradient(
                100deg,
                rgba(255,255,255,0),
                rgba(255,255,255,.22),
                rgba(255,255,255,0)
            );
            transform:skewX(-20deg);
            transition:left .5s ease;
            pointer-events:none;
        }

        #generate-duty-btn.cg5-generator-launch:hover{
            transform:translateY(-1px);
            filter:brightness(1.07);
            box-shadow:
                inset 0 1px 0 rgba(255,255,255,.28),
                0 2px 4px rgba(3,45,55,.25),
                0 10px 22px rgba(3,45,55,.28);
        }

        #generate-duty-btn.cg5-generator-launch:hover::after{
            left:130%;
        }

        #generate-duty-btn.cg5-generator-launch:active{
            transform:translateY(0);
            filter:brightness(.97);
            box-shadow:
                inset 0 1px 2px rgba(0,0,0,.18),
                0 2px 6px rgba(3,45,55,.20);
        }

        #generate-duty-btn.cg5-generator-launch:focus-visible{
            outline:none;
            box-shadow:
                inset 0 1px 0 rgba(255,255,255,.25),
                0 0 0 3px rgba(8,125,120,.35),
                0 6px 16px rgba(3,45,55,.20);
        }

        #generate-duty-btn.cg5-generator-launch .cg5-launch-icon{
            width:26px;
            height:26px;
            flex-shrink:0;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            border:1px solid rgba(255,255,255,.22);
            border-radius:8px;
            background:rgba(255,255,255,.14);
            line-height:1;
        }

        #generate-duty-btn.cg5-generator-launch .cg5-launch-icon svg{
            width:15px;
            height:15px;
            display:block;
        }

        @media(prefers-reduced-motion:reduce){
            #generate-duty-btn.cg5-generator-launch,
            #generate-duty-btn.cg5-generator-launch::after{
                transition:none;
            }
        }

        #duty-generator-modal{
            position:fixed;
            inset:0;
            z-index:10000;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:24px;
            box-sizing:border-box;
        }

        #duty-generator-modal.hidden{
            display:none;
        }

        #duty-generator-modal .cg5-generator-backdrop{
            position:absolute;
            inset:0;
            background:rgba(3,16,27,.72);
            backdrop-filter:blur(6px);
            -webkit-backdrop-filter:blur(6px);
        }

        #duty-generator-modal .cg5-generator-modal{
            position:relative;
            z-index:1;
            width:min(1080px,100%);
            max-height:calc(100vh - 48px);
            display:flex;
            flex-direction:column;
            overflow:hidden;
            border:1px solid rgba(13,91,105,.18);
            border-radius:18px;
            background:#f7f9fb;
            box-shadow:
                0 28px 80px rgba(0,0,0,.34),
                0 4px 20px rgba(0,0,0,.12);
            animation:cg5GeneratorIn .2s ease-out;
        }

        @keyframes cg5GeneratorIn{
            from{
                opacity:0;
                transform:translateY(12px) scale(.985);
            }
            to{
                opacity:1;
                transform:translateY(0) scale(1);
            }
        }

        #duty-generator-modal .cg5-generator-header{
            position:relative;
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:20px;
            padding:19px 24px;
            background:linear-gradient(135deg,#062d42,#074c5d);
            color:#fff;
        }

        #duty-generator-modal .cg5-generator-title-wrap{
            display:flex;
            align-items:center;
            gap:13px;
            min-width:0;
        }

        #duty-generator-modal .cg5-generator-logo{
            width:42px;
            height:42px;
            flex:0 0 42px;
            display:flex;
            align-items:center;
            justify-content:center;
            border:1px solid rgba(255,255,255,.18);
            border-radius:12px;
            background:rgba(255,255,255,.09);
            color:#d7b45a;
            font-size:20px;
            font-weight:900;
        }

        #duty-generator-modal .cg5-generator-title{
            margin:0;
            color:#fff;
            font-size:18px;
            line-height:1.2;
            font-weight:850;
        }

        #duty-generator-modal .cg5-generator-subtitle{
            margin:4px 0 0;
            color:rgba(255,255,255,.68);
            font-size:11px;
            font-weight:600;
        }

        #duty-generator-modal .cg5-generator-close{
            width:36px;
            height:36px;
            flex:0 0 36px;
            display:flex;
            align-items:center;
            justify-content:center;
            border:1px solid rgba(255,255,255,.14);
            border-radius:9px;
            background:rgba(255,255,255,.08);
            color:#fff;
            font-size:24px;
            line-height:1;
            cursor:pointer;
            transition:background .18s ease,transform .18s ease;
        }

        #duty-generator-modal .cg5-generator-close:hover{
            background:rgba(255,255,255,.16);
            transform:rotate(3deg);
        }

        #duty-generator-modal .cg5-generator-body{
            overflow:auto;
            padding:22px 24px 20px;
            background:#f7f9fb;
        }

        #duty-generator-modal .cg5-generator-section{
            margin-bottom:18px;
            padding:17px;
            border:1px solid #e1e8ed;
            border-radius:13px;
            background:#fff;
            box-shadow:0 2px 8px rgba(14,42,58,.035);
        }

        #duty-generator-modal .cg5-generator-section:last-child{
            margin-bottom:0;
        }

        #duty-generator-modal .cg5-generator-section-head{
            display:flex;
            align-items:flex-start;
            gap:10px;
            margin-bottom:14px;
        }

        #duty-generator-modal .cg5-generator-section-number{
            width:25px;
            height:25px;
            flex:0 0 25px;
            display:flex;
            align-items:center;
            justify-content:center;
            border-radius:7px;
            background:#e8f3f3;
            color:#096c6d;
            font-size:11px;
            font-weight:900;
        }

        #duty-generator-modal .cg5-generator-section-title{
            margin:0;
            color:#173746;
            font-size:13px;
            font-weight:850;
        }

        #duty-generator-modal .cg5-generator-section-description{
            margin:3px 0 0;
            color:#7a8a94;
            font-size:10.5px;
            line-height:1.4;
        }

        #duty-generator-modal .cg5-generator-grid{
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:13px;
        }

        #duty-generator-modal .cg5-generator-grid.three{
            grid-template-columns:repeat(3,minmax(0,1fr));
        }

        #duty-generator-modal .cg5-generator-field{
            min-width:0;
        }

        #duty-generator-modal .cg5-generator-field label{
            display:block;
            margin:0 0 6px;
            color:#38515d;
            font-size:10.5px;
            font-weight:800;
            letter-spacing:.15px;
        }

        #duty-generator-modal .cg5-generator-field input,
        #duty-generator-modal .cg5-generator-field select{
            width:100%;
            height:42px;
            box-sizing:border-box;
            padding:0 11px;
            border:1px solid #d6e0e6;
            border-radius:9px;
            outline:none;
            background:#fbfcfd;
            color:#183440;
            font-family:inherit;
            font-size:12px;
            font-weight:600;
            transition:
                border-color .16s ease,
                box-shadow .16s ease,
                background .16s ease;
        }

        #duty-generator-modal .cg5-generator-field select{
            cursor:pointer;
        }

        #duty-generator-modal .cg5-generator-field input:focus,
        #duty-generator-modal .cg5-generator-field select:focus{
            border-color:#16827e;
            background:#fff;
            box-shadow:0 0 0 3px rgba(22,130,126,.10);
        }

        #duty-generator-modal .cg5-generator-field input:hover,
        #duty-generator-modal .cg5-generator-field select:hover{
            border-color:#b9cbd4;
            background:#fff;
        }

        #duty-generator-modal .cg5-generator-preview{
            display:none;
        }

        #duty-generator-modal .cg5-generator-preview.visible{
            display:block;
        }

        #duty-generator-modal .cg5-generator-preview-shell{
            max-height:410px;
            overflow:auto;
            padding:4px;
            border:1px solid #e0e7eb;
            border-radius:11px;
            background:#f6f8fa;
        }

        #duty-generator-modal .cg5-generator-day{
            margin:8px;
            overflow:hidden;
            border:1px solid #dce5ea;
            border-radius:11px;
            background:#fff;
            box-shadow:0 2px 7px rgba(16,46,61,.035);
        }

        #duty-generator-modal .cg5-generator-day-header{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            padding:11px 13px;
            border-bottom:1px solid #e7edf0;
            background:#f9fbfc;
        }

        #duty-generator-modal .cg5-generator-day-date{
            color:#173b4a;
            font-size:12px;
            font-weight:850;
        }

        #duty-generator-modal .cg5-generator-day-key{
            margin-top:2px;
            color:#91a0a8;
            font-size:9.5px;
            font-weight:600;
        }

        #duty-generator-modal .cg5-generator-day-type{
            padding:5px 8px;
            border-radius:6px;
            font-size:8px;
            font-weight:900;
            letter-spacing:.5px;
        }

        #duty-generator-modal .cg5-generator-day-type.weekday{
            background:#edf6f6;
            color:#147472;
        }

        #duty-generator-modal .cg5-generator-day-type.weekend{
            background:#fff4df;
            color:#9b6a14;
        }

        #duty-generator-modal .cg5-generator-assignments{
            padding:3px 13px;
        }

        #duty-generator-modal .cg5-generator-assignment{
            display:grid;
            grid-template-columns:150px minmax(0,1fr);
            align-items:center;
            gap:13px;
            min-height:43px;
            border-bottom:1px solid #edf1f3;
        }

        #duty-generator-modal .cg5-generator-assignment:last-child{
            border-bottom:0;
        }

        #duty-generator-modal .cg5-generator-duty-tag{
            width:max-content;
            min-width:115px;
            padding:5px 8px;
            border-radius:6px;
            font-size:8.5px;
            font-weight:850;
            letter-spacing:.1px;
        }

        #duty-generator-modal .cg5-generator-duty-tag.pow{
            background:#eef2f7;
            color:#465c72;
        }

        #duty-generator-modal .cg5-generator-duty-tag.ow{
            background:#eaf6f5;
            color:#17756f;
        }

        #duty-generator-modal .cg5-generator-duty-tag.operation{
            background:#edf5fb;
            color:#24668a;
        }

        #duty-generator-modal .cg5-generator-duty-tag.liaison{
            background:#f4eff9;
            color:#73538d;
        }

        #duty-generator-modal .cg5-generator-duty-tag.ood{
            background:#fff3df;
            color:#996617;
        }

        #duty-generator-modal .cg5-generator-duty-tag.weekend{
            background:#edf6f2;
            color:#37735b;
        }

        #duty-generator-modal .cg5-generator-assignee{
            min-width:0;
            display:flex;
            align-items:center;
            gap:9px;
        }

        #duty-generator-modal .cg5-generator-serial{
            flex:0 0 auto;
            padding:3px 6px;
            border-radius:5px;
            background:#f1f4f6;
            color:#71808a;
            font-size:9px;
            font-weight:800;
        }

        #duty-generator-modal .cg5-generator-name{
            min-width:0;
            overflow:hidden;
            color:#263f4b;
            font-size:11px;
            font-weight:750;
            text-overflow:ellipsis;
            white-space:nowrap;
        }

        #duty-generator-modal .cg5-generator-no-duty{
            padding:15px 5px;
            color:#8a989f;
            font-size:11px;
            text-align:center;
        }

        #duty-generator-modal .cg5-generator-empty{
            padding:35px 15px;
            color:#7f8f97;
            font-size:11px;
            text-align:center;
        }

        #duty-generator-modal .cg5-generator-empty-icon{
            margin-bottom:7px;
            color:#17807b;
            font-size:24px;
            font-weight:900;
        }

        #duty-generator-modal .cg5-generator-status{
            min-height:18px;
            margin-top:13px;
            padding:0 2px;
            color:#7a8b94;
            font-size:10.5px;
            line-height:1.5;
        }

        #duty-generator-modal .cg5-generator-status.success{
            display:flex;
            align-items:center;
            gap:7px;
            color:#14716d;
            font-weight:650;
        }

        #duty-generator-modal .cg5-status-dot{
            width:7px;
            height:7px;
            flex:0 0 7px;
            border-radius:50%;
            background:#18a39a;
            box-shadow:0 0 0 3px rgba(24,163,154,.11);
        }

        #duty-generator-modal .cg5-generator-footer{
            display:flex;
            align-items:center;
            justify-content:flex-end;
            gap:9px;
            padding:14px 24px;
            border-top:1px solid #e1e8ec;
            background:#fff;
        }

        #duty-generator-modal .cg5-generator-btn{
            min-height:39px;
            padding:0 15px;
            border:1px solid #d4dfe4;
            border-radius:8px;
            background:#fff;
            color:#435964;
            font-family:inherit;
            font-size:11px;
            font-weight:800;
            cursor:pointer;
            transition:
                transform .16s ease,
                box-shadow .16s ease,
                background .16s ease,
                border-color .16s ease;
        }

        #duty-generator-modal .cg5-generator-btn:hover{
            transform:translateY(-1px);
            border-color:#b9cbd3;
            box-shadow:0 4px 12px rgba(20,49,61,.08);
        }

        #duty-generator-modal .cg5-generator-btn.generate{
            border-color:#0a706f;
            background:#0a706f;
            color:#fff;
            box-shadow:0 4px 12px rgba(10,112,111,.18);
        }

        #duty-generator-modal .cg5-generator-btn.generate:hover{
            background:#086260;
        }

        #duty-generator-modal .cg5-generator-btn.apply{
            border-color:#c7972c;
            background:linear-gradient(135deg,#b7831f,#d2a43b);
            color:#fff;
            box-shadow:0 4px 12px rgba(184,132,31,.2);
        }

        #duty-generator-modal .cg5-generator-btn.apply:hover{
            filter:brightness(1.04);
        }

        #duty-generator-modal .cg5-generator-btn:disabled{
            opacity:.48;
            cursor:not-allowed;
            transform:none;
            box-shadow:none;
        }

        #duty-generator-modal .cg5-generator-swap-wrap{
            display:flex;
            align-items:center;
        }

        #duty-generator-modal .cg5-generator-swap{
            width:100%;
            max-width:320px;
            height:36px;
            padding:0 10px;
            border:1px solid #d6e0e6;
            border-radius:8px;
            outline:none;
            background:#fbfcfd;
            color:#183440;
            font-family:inherit;
            font-size:11.5px;
            font-weight:600;
            cursor:pointer;
            transition:
                border-color .16s ease,
                box-shadow .16s ease,
                background .16s ease;
        }

        #duty-generator-modal .cg5-generator-swap:focus{
            border-color:#16827e;
            background:#fff;
            box-shadow:0 0 0 3px rgba(22,130,126,.10);
        }

        @media(max-width:760px){
            #duty-generator-modal{
                padding:0;
            }

            #duty-generator-modal .cg5-generator-modal{
                width:100%;
                height:100%;
                max-height:100vh;
                border:0;
                border-radius:0;
            }

            #duty-generator-modal .cg5-generator-header{
                padding:14px 16px;
            }

            #duty-generator-modal .cg5-generator-title{
                font-size:16px;
            }

            #duty-generator-modal .cg5-generator-subtitle{
                font-size:10px;
            }

            #duty-generator-modal .cg5-generator-close{
                width:40px;
                height:40px;
                font-size:26px;
            }

            #duty-generator-modal .cg5-generator-body{
                padding:14px;
            }

            #duty-generator-modal .cg5-generator-section{
                padding:14px;
                margin-bottom:14px;
            }

            #duty-generator-modal .cg5-generator-grid,
            #duty-generator-modal .cg5-generator-grid.three{
                grid-template-columns:1fr;
            }

            #duty-generator-modal .cg5-generator-field input,
            #duty-generator-modal .cg5-generator-field select{
                height:46px;
                font-size:13px;
            }

            #duty-generator-modal .cg5-generator-assignment{
                grid-template-columns:1fr;
                gap:8px;
                padding:10px 0;
            }

            #duty-generator-modal .cg5-generator-duty-tag{
                width:max-content;
                min-width:0;
                font-size:9.5px;
                padding:6px 9px;
            }

            #duty-generator-modal .cg5-generator-serial{
                font-size:10px;
                padding:4px 7px;
            }

            #duty-generator-modal .cg5-generator-name{
                font-size:12.5px;
            }

            #duty-generator-modal .cg5-generator-day-date{
                font-size:13px;
            }

            #duty-generator-modal .cg5-generator-day-key{
                font-size:10px;
            }

            #duty-generator-modal .cg5-generator-swap{
                max-width:none;
                height:42px;
                font-size:12.5px;
            }

            #duty-generator-modal .cg5-generator-preview-shell{
                max-height:none;
            }

            #duty-generator-modal .cg5-generator-footer{
                position:sticky;
                bottom:0;
                flex-wrap:wrap;
                padding:12px 14px;
            }

            #duty-generator-modal .cg5-generator-btn{
                flex:1 1 auto;
                min-height:46px;
                font-size:12px;
            }

            #generate-duty-btn.cg5-generator-launch{
                margin-left:6px;
                min-width:0;
            }
        }

        @media(max-width:520px){
            #generate-duty-btn.cg5-generator-launch{
                width:100%;
                margin:8px 0 0;
                height:44px;
            }

            #duty-generator-modal .cg5-generator-logo{
                display:none;
            }

            #duty-generator-modal .cg5-generator-title{
                font-size:15px;
            }

            #duty-generator-modal .cg5-generator-subtitle{
                display:none;
            }

            #duty-generator-modal .cg5-generator-section-head{
                gap:8px;
            }

            #duty-generator-modal .cg5-generator-section-number{
                width:22px;
                height:22px;
                flex:0 0 22px;
                font-size:10px;
            }

            #duty-generator-modal .cg5-generator-assignee{
                display:flex;
            }
        }
    `;

    document.head.appendChild(style);
}

function createDutyGeneratorButton(){
    injectDutyGeneratorStyles();

    let button=
        $("generate-duty-btn");

    if(button){
        button.classList.add(
            "cg5-generator-launch"
        );

        if(!button.querySelector(".cg5-launch-icon")){
            button.innerHTML=
                `<span class="cg5-launch-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><path d="M12 12.8l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" fill="currentColor" stroke="none"/></svg></span><span>Generate Duty Rotation</span>`;
        }

        return button;
    }

    button=
        document.createElement("button");

    button.type="button";
    button.id="generate-duty-btn";
    button.className="cg5-generator-launch";

    button.innerHTML=
        `<span class="cg5-launch-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><path d="M12 12.8l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" fill="currentColor" stroke="none"/></svg></span><span>Generate Duty Rotation</span>`;

    let target=
        document.querySelector(
            ".calendar-header-actions"
        );

    if(!target){
        target=
            document.querySelector(
                ".calendar-actions"
            );
    }

    if(!target){
        target=
            document.querySelector(
                ".calendar-controls"
            );
    }

    if(!target&&calendarMonthEl)
        target=
            calendarMonthEl.parentElement;

    if(!target&&calendarEl)
        target=
            calendarEl.parentElement;

    if(target)
        target.appendChild(button);
    else
        document.body.appendChild(button);

    return button;
}

function createDutyGeneratorModal(){
    injectDutyGeneratorStyles();

    if($("duty-generator-modal"))
        return;

    const modal=
        document.createElement("div");

    modal.id="duty-generator-modal";
    modal.className="hidden";

    modal.innerHTML=`
        <div
            class="cg5-generator-backdrop"
            id="duty-generator-backdrop">
        </div>

        <div class="cg5-generator-modal">
            <div class="cg5-generator-header">
                <div class="cg5-generator-title-wrap">
                    <div class="cg5-generator-logo">
                        ✦
                    </div>

                    <div>
                        <h3 class="cg5-generator-title">
                            Generate Duty Rotation
                        </h3>

                        <p class="cg5-generator-subtitle">
                            CG-5 Duty Calendar Rotation Generator
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    class="cg5-generator-close"
                    id="close-duty-generator"
                    aria-label="Close">
                    ×
                </button>
            </div>

            <div class="cg5-generator-body">
                <div class="cg5-generator-section">
                    <div class="cg5-generator-section-head">
                        <div class="cg5-generator-section-number">
                            01
                        </div>

                        <div>
                            <h4 class="cg5-generator-section-title">
                                Rotation Period
                            </h4>

                            <p class="cg5-generator-section-description">
                                Set the date where the new duty rotation will begin and how many days to generate.
                            </p>
                        </div>
                    </div>

                    <div class="cg5-generator-grid">
                        <div class="cg5-generator-field">
                            <label for="generator-start-date">
                                Starting Date
                            </label>

                            <input
                                type="date"
                                id="generator-start-date">
                        </div>

                        <div class="cg5-generator-field">
                            <label for="generator-days">
                                Number of Days
                            </label>

                            <input
                                type="number"
                                id="generator-days"
                                min="1"
                                max="366"
                                value="30">
                        </div>
                    </div>
                </div>

                <div class="cg5-generator-section">
                    <div class="cg5-generator-section-head">
                        <div class="cg5-generator-section-number">
                            02
                        </div>

                        <div>
                            <h4 class="cg5-generator-section-title">
                                Duty Rotation Starting Personnel
                            </h4>

                            <p class="cg5-generator-section-description">
                                POW and Liaison keep their current rotation. Choose a Set for the Officewatch and Operation serial ranges.
                            </p>
                        </div>
                    </div>

                    <div class="cg5-generator-range-control">
                        <div class="cg5-generator-range-buttons">
                            <button type="button" class="secondary-button" data-generator-range-set="A" aria-pressed="false">Set A</button>
                            <button type="button" class="secondary-button" data-generator-range-set="B" aria-pressed="false">Set B</button>
                        </div>
                        <p id="generator-range-description" class="cg5-generator-section-description"></p>
                        <p class="cg5-generator-section-description">Personnel are listed from Junior to Senior. A Desk may have at most two duty assignments per day. The generator tries to swap Officewatch or Operation with a neighboring duty day when needed and adds a note.</p>
                    </div>

                    <div class="cg5-generator-grid">
                        <div class="cg5-generator-field">
                            <label for="generator-pow">
                                Duty POW Starting
                            </label>

                            <select id="generator-pow">
                                <option value="">
                                    Select Personnel
                                </option>
                            </select>
                        </div>

                        <div class="cg5-generator-field">
                            <label for="generator-officewatch">
                                Duty Office Watch Starting
                            </label>

                            <select id="generator-officewatch">
                                <option value="">
                                    Select Personnel
                                </option>
                            </select>
                        </div>

                        <div class="cg5-generator-field">
                            <label for="generator-operation">
                                Duty Operation Starting
                            </label>

                            <select id="generator-operation">
                                <option value="">
                                    Select Personnel
                                </option>
                            </select>
                        </div>

                        <div class="cg5-generator-field">
                            <label for="generator-liaison">
                                Duty Liaison Starting
                            </label>

                            <select id="generator-liaison">
                                <option value="">
                                    Select Personnel
                                </option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="cg5-generator-section">
                    <div class="cg5-generator-section-head">
                        <div class="cg5-generator-section-number">
                            03
                        </div>

                        <div>
                            <h4 class="cg5-generator-section-title">
                                Weekend Rotation Starting Personnel
                            </h4>

                            <p class="cg5-generator-section-description">
                                These starting personnel are used for the weekend OOD, OW/OPS and Liaison rotation.
                            </p>
                        </div>
                    </div>

                    <div class="cg5-generator-grid three">
                        <div class="cg5-generator-field">
                            <label for="generator-ood">
                                Duty OOD Starting
                            </label>

                            <select id="generator-ood">
                                <option value="">
                                    Select Personnel
                                </option>
                            </select>
                        </div>

                        <div class="cg5-generator-field">
                            <label for="generator-weekend-ow">
                                Weekend OW/OPS Starting
                            </label>

                            <select id="generator-weekend-ow">
                                <option value="">
                                    Select Personnel
                                </option>
                            </select>
                        </div>

                        <div class="cg5-generator-field">
                            <label for="generator-weekend-liaison">
                                Weekend Liaison Starting
                            </label>

                            <select id="generator-weekend-liaison">
                                <option value="">
                                    Select Personnel
                                </option>
                            </select>
                        </div>
                    </div>
                </div>

                <div
                    id="generator-status"
                    class="cg5-generator-status">
                </div>

                <div
                    id="generator-preview"
                    class="cg5-generator-section cg5-generator-preview">

                    <div class="cg5-generator-section-head">
                        <div class="cg5-generator-section-number">
                            04
                        </div>

                        <div>
                            <h4 class="cg5-generator-section-title">
                                Generated Rotation
                            </h4>

                            <p class="cg5-generator-section-description">
                                Review the generated duty assignments before applying them to the calendar.
                            </p>
                        </div>
                    </div>

                    <div class="cg5-generator-preview-shell">
                        <div id="generator-preview-content"></div>
                    </div>
                </div>
            </div>

            <div class="cg5-generator-footer">
                <button
                    type="button"
                    class="cg5-generator-btn"
                    id="cancel-duty-generator">
                    Close
                </button>

                <button
                    type="button"
                    class="cg5-generator-btn generate"
                    id="generate-rotation-btn" data-admin-only>
                    Generate Rotation
                </button>

                <button
                    type="button"
                    class="cg5-generator-btn apply"
                    id="apply-rotation-btn" data-admin-only
                    disabled>
                    Apply to Calendar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    on(
        $("close-duty-generator"),
        "click",
        closeDutyGenerator
    );

    on(
        $("cancel-duty-generator"),
        "click",
        closeDutyGenerator
    );

    on(
        $("duty-generator-backdrop"),
        "click",
        closeDutyGenerator
    );

    on(
        $("generate-rotation-btn"),
        "click",
        generateDutyRotation
    );

    on(
        $("apply-rotation-btn"),
        "click",
        applyDutyRotation
    );

    on(
        $("generator-start-date"),
        "change",
        ()=>{
            generatedDutyRotation=null;

            const preview=$("generator-preview");
            const applyButton=$("apply-rotation-btn");

            if(preview)
                preview.classList.remove("visible");

            if(applyButton)
                applyButton.disabled=true;

            const status=$("generator-status");

            if(status){
                status.className=
                    "cg5-generator-status";

                status.textContent="";
            }

            populateDutyGeneratorPersonnel();
        }
    );

    on(
        $("generator-preview-content"),
        "change",
        onGeneratorAssignmentChange
    );

    populateDutyGeneratorPersonnel();
}

function openDutyGenerator(){
    if(!isCg5Admin())return;
    createDutyGeneratorModal();

    const modal=
        $("duty-generator-modal");

    if(!modal)
        return;

    const start=
        $("generator-start-date");

    if(start&&!start.value)
        start.value=
            formatDateKey(new Date());

    const days=
        $("generator-days");

    if(days&&!days.value)
        days.value="30";

    generatedDutyRotation=null;

    const preview=
        $("generator-preview");

    const applyButton=
        $("apply-rotation-btn");

    const status=
        $("generator-status");

    if(preview)
        preview.classList.remove("visible");

    if(applyButton)
        applyButton.disabled=true;

    if(status){
        status.className=
            "cg5-generator-status";

        status.textContent="";
    }

    populateDutyGeneratorPersonnel();

    modal.classList.remove("hidden");

    document.body.classList.add(
        "cg5-generator-open"
    );
}

function closeDutyGenerator(){
    const modal=
        $("duty-generator-modal");

    if(modal)
        modal.classList.add("hidden");

    document.body.classList.remove(
        "cg5-generator-open"
    );
}

function initializeDutyGenerator(){
    injectDutyGeneratorStyles();

    try{
        const savedSet=localStorage.getItem(
            GENERATOR_RANGE_SET_KEY
        );

        if(GENERATOR_RANGE_SETS[savedSet])
            generatorRangeSet=savedSet;
    }catch(error){}

    const button=
        createDutyGeneratorButton();

    if(button)
        button.onclick=openDutyGenerator;

    createDutyGeneratorModal();
    updateGeneratorRangeControls();

    document.querySelectorAll("[data-generator-range-set]").forEach(button=>{
        button.onclick=()=>
            selectGeneratorRangeSet(button.dataset.generatorRangeSet);
    });

    const closeButton=$("close-duty-generator");
    const cancelButton=$("cancel-duty-generator");
    const backdrop=$("duty-generator-backdrop");
    const generateButton=$("generate-rotation-btn");
    const applyButton=$("apply-rotation-btn");

    if(closeButton)
        closeButton.onclick=closeDutyGenerator;
    if(cancelButton)
        cancelButton.onclick=closeDutyGenerator;
    if(backdrop)
        backdrop.onclick=closeDutyGenerator;
    if(generateButton)
        generateButton.onclick=generateDutyRotation;
    if(applyButton)
        applyButton.onclick=applyDutyRotation;

    const previewContent=$("generator-preview-content");
    if(previewContent)
        previewContent.onchange=onGeneratorAssignmentChange;

    const htmlButton=
        $("generate-duty-btn");

    if(htmlButton)
        htmlButton.onclick=openDutyGenerator;

    const start=
        $("generator-start-date");

    if(start){
        start.value=
            start.value||
            formatDateKey(new Date());

        on(
            start,
            "change",
            ()=>{
                populateDutyGeneratorPersonnel();
            }
        );
    }

    populateDutyGeneratorPersonnel();
}

on(
    previousMonthBtn,
    "click",
    ()=>{
        visibleMonth=
            new Date(
                visibleMonth.getFullYear(),
                visibleMonth.getMonth()-1,
                1
            );

        selectedDate=null;

        refreshRoster();
    }
);

on(
    nextMonthBtn,
    "click",
    ()=>{
        visibleMonth=
            new Date(
                visibleMonth.getFullYear(),
                visibleMonth.getMonth()+1,
                1
            );

        selectedDate=null;

        refreshRoster();
    }
);

on(
    dutySearch,
    "input",
    renderCalendar
);

on(
    addPersonnelBtn,
    "click",
    ()=>{
        resetPersonnelForm();

        personnelForm.classList.remove("hidden");

        personnelSerial.focus();
    }
);

on(
    cancelPersonnelBtn,
    "click",
    ()=>{
        resetPersonnelForm();

        personnelForm.classList.add("hidden");
    }
);

on(
    personnelForm,
    "submit",
    savePersonnel
);

on(
    personnelList,
    "click",
    event=>{
        const button=
            event.target.closest(
                "button[data-action]"
            );

        if(!button)
            return;

        const{id,action}=button.dataset;

        if(action==="edit")
            editPersonnel(id);

        if(action==="delete")
            deletePersonnel(id);

        if(action==="exemption")
            openExemption(id);

        if(action==="special-duty")
            openSpecialDuty(id);
    }
);

on(
    exemptionList,
    "click",
    event=>{
        const button=
            event.target.closest(
                "button[data-action='delete-exemption']"
            );

        if(button)
            deleteExemption(
                button.dataset.id
            );
    }
);

on(
    saveExemptionBtn,
    "click",
    saveExemption
);

on(
    cancelExemptionBtn,
    "click",
    closeExemptionModal
);

on(
    closeExemptionBtn,
    "click",
    closeExemptionModal
);

async function initializeDutyCalendar(){
    try{
        const access=await window.cg5Access?.ready;
        if(!access){
            if(calendarParams.get("home")==="1"&&window.parent!==window){
                window.parent.postMessage({
                    type:"cg5-home-duty-today-error",
                    date:homeCalendarDate
                },window.location.origin);
            }
            return;
        }
        ensureDutyOptions();

        await loadPersonnel();
        await loadExemptions();
        await loadSpecialDuties();
        await loadSharedAppliedRotation();

        initializeDutyGenerator();

        const appliedConfig=
            getAppliedRotationConfig();

        const appliedRoster=
            getAppliedRotationRoster();

        if(appliedConfig){
            console.log(
                "Applied Duty Rotation loaded:",
                appliedConfig
            );
        }

        if(appliedRoster){
            console.log(
                "Applied Duty Rotation Roster loaded:",
                appliedRoster
            );
        }

        const todayKey=
            formatDateKey(new Date());

        selectedDate=todayKey;

        refreshRoster();

        if(calendarParams.get("home")==="1"&&window.parent!==window){
            const todayRoster=roster[todayKey];
            window.parent.postMessage({
                type:"cg5-home-duty-today",
                date:todayKey,
                assignments:(todayRoster?.assignments||[]).map(item=>({
                    label:item.label||item.slotKey||"Duty",
                    name:item.person?.full_name_rank||"",
                    serial:item.person?.serial_number||"",
                    specialDuty:!!item.specialDuty
                }))
            },window.location.origin);
        }

    }catch(error){
        console.error(
            "Duty Calendar initialization error:",
            error
        );
        if(calendarParams.get("home")==="1"&&window.parent!==window){
            window.parent.postMessage({
                type:"cg5-home-duty-today-error",
                date:homeCalendarDate
            },window.location.origin);
        }
    }
}



window.cg5DutyRotation={
    getAppliedConfig:()=>JSON.parse(
        JSON.stringify(
            getAppliedRotationConfig()
        )
    ),

    getAppliedRoster:()=>JSON.parse(
        JSON.stringify(
            getAppliedRotationRoster()
        )
    ),

    getGeneratedRoster:()=>JSON.parse(
        JSON.stringify(
            generatedDutyRotation
        )
    ),

    openGenerator:openDutyGenerator,
    generate:generateDutyRotation,
    apply:applyDutyRotation
};

initializeDutyCalendar();
