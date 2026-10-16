const SUPABASE_URL="https://qxiufjlserfxgblftieb.supabase.co";
const SUPABASE_KEY="sb_publishable_H0hMUqF1YM5rUT9cdLAqJA_qiQfNznA";
const supabaseClient=window.cg5Supabase||window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

function isCg5Admin(){
    return window.cg5Access?.isAdmin()===true;
}

const POW_START=13481;
const POW_END=21800;

const OW_OPS_START=24531;
const OW_OPS_END=29521;

const LIAISON_START=30686;
const LIAISON_END=32648;

const OOD_START=2880;
const OOD_END=3582;

const BC_PATTERN=[
    {ow:"B",operation:"B"},
    {ow:"C",operation:"B"},
    {ow:"B",operation:"B"},
    {ow:"B",operation:"C"},
    {ow:"C",operation:"B"}
];

let personnel=[];
let generatedRoster=[];

const startDateEl=document.getElementById("start-date");
const numberDaysEl=document.getElementById("number-days");

const startingPowEl=document.getElementById("starting-pow");
const startingOfficewatchEl=document.getElementById("starting-officewatch");
const startingOperationEl=document.getElementById("starting-operation");
const startingLiaisonEl=document.getElementById("starting-liaison");

const startingOodEl=document.getElementById("starting-ood");
const startingWeekendOwEl=document.getElementById("starting-weekend-ow");
const startingWeekendLiaisonEl=document.getElementById("starting-weekend-liaison");

const generateBtn=document.getElementById("generate-btn");
const applyBtn=document.getElementById("apply-btn");
const clearBtn=document.getElementById("clear-btn");

const generatorStatus=document.getElementById("generator-status");
const rosterPreview=document.getElementById("roster-preview");
const rosterSummary=document.getElementById("roster-summary");

function normalizeDuty(duty){
    duty=String(duty||"").trim();

    if(duty==="Duty Officewatch and Operation")
        return "Duty Officewatch/Operation";

    if(duty==="Duty Officewatch and Operation and Liaison")
        return "Duty Officewatch/Operation/Liaison";

    return duty;
}

function getNumericSerial(serial){
    const value=String(serial||"").trim().toUpperCase();

    if(/^O[-\s]?\d+$/.test(value))
        return null;

    const digits=value.replace(/\D/g,"");

    return digits?Number(digits):null;
}

function getOodSerial(serial){
    const match=String(serial||"")
        .trim()
        .toUpperCase()
        .match(/^O[-\s]?(\d+)$/);

    return match?Number(match[1]):null;
}

function comparePersonnel(a,b){
    const ao=getOodSerial(a.serial_number);
    const bo=getOodSerial(b.serial_number);

    const an=ao!==null?ao:getNumericSerial(a.serial_number);
    const bn=bo!==null?bo:getNumericSerial(b.serial_number);

    if(an!==null&&bn!==null&&an!==bn)
        return an-bn;

    return String(a.serial_number).localeCompare(
        String(b.serial_number),
        undefined,
        {numeric:true}
    );
}

function sortPersonnel(list){
    return [...list].sort(comparePersonnel);
}

function serialAllowsDuty(serial,type){
    const numeric=getNumericSerial(serial);
    const ood=getOodSerial(serial);

    if(type==="OOD")
        return ood!==null&&ood>=OOD_START&&ood<=OOD_END;

    if(ood!==null||numeric===null)
        return false;

    if(type==="POW")
        return numeric>=POW_START&&numeric<=POW_END;

    if(type==="Officewatch"||type==="Operation")
        return numeric>=OW_OPS_START&&numeric<=OW_OPS_END;

    if(type==="Liaison")
        return numeric>=LIAISON_START&&numeric<=LIAISON_END;

    return false;
}

function getBCGroup(person){
    const serial=getNumericSerial(person?.serial_number);

    if(serial!==null&&serial>=OW_OPS_START&&serial<=OW_OPS_END)
        return "B";

    if(serial!==null&&serial>=LIAISON_START&&serial<=LIAISON_END)
        return "C";

    return null;
}

function dutyAllowsSelection(person,type){
    const duty=normalizeDuty(person.duty);

    if(type==="OOD")
        return duty==="Duty OOD";

    if(type==="POW")
        return duty==="Duty POW";

    if(type==="Officewatch")
        return (
            duty==="Duty Officewatch" ||
            duty==="Duty Officewatch/Operation" ||
            duty==="Duty Officewatch/Operation/Liaison"
        );

    if(type==="Operation")
        return (
            duty==="Duty Operation" ||
            duty==="Duty Officewatch/Operation" ||
            duty==="Duty Officewatch/Operation/Liaison"
        );

    if(type==="Liaison")
        return (
            duty==="Duty Liaison" ||
            duty==="Duty Officewatch/Operation/Liaison"
        );

    return false;
}

function isEligible(person,type,group=null){
    if(!person)
        return false;

    if(!serialAllowsDuty(person.serial_number,type))
        return false;

    if(!dutyAllowsSelection(person,type))
        return false;

    if(group&&getBCGroup(person)!==group)
        return false;

    return true;
}

function getPool(type,group=null){
    return sortPersonnel(
        personnel.filter(person=>isEligible(person,type,group))
    );
}

function findSelectedPerson(select,type,group=null){
    const id=Number(select.value);

    if(!id)
        return null;

    const person=personnel.find(
        item=>Number(item.id)===id
    );

    if(!person)
        return null;

    if(!isEligible(person,type,group))
        return null;

    return person;
}

function formatDateKey(date){
    return [
        date.getFullYear(),
        String(date.getMonth()+1).padStart(2,"0"),
        String(date.getDate()).padStart(2,"0")
    ].join("-");
}

function parseDateKey(key){
    const parts=String(key).split("-").map(Number);

    return new Date(
        parts[0],
        parts[1]-1,
        parts[2]
    );
}

function addDays(date,days){
    const result=new Date(date);

    result.setDate(
        result.getDate()+days
    );

    return result;
}

function isWeekend(date){
    const day=date.getDay();

    return day===0||day===6;
}

function formatLongDate(key){
    return parseDateKey(key).toLocaleDateString(
        "en-US",
        {
            weekday:"long",
            month:"long",
            day:"numeric",
            year:"numeric"
        }
    );
}

function setSelectOptions(select,type,group=null){
    const pool=getPool(type,group);

    select.innerHTML="";

    const first=document.createElement("option");

    first.value="";
    first.textContent="Select Personnel";

    select.appendChild(first);

    pool.forEach(person=>{
        const option=document.createElement("option");

        option.value=person.id;
        option.textContent=
            `${person.full_name_rank} — ${person.serial_number}`;

        select.appendChild(option);
    });

    if(!pool.length)
        first.textContent="No eligible personnel";
}

function loadAllPersonnelOptions(){
    setSelectOptions(
        startingPowEl,
        "POW"
    );

    setSelectOptions(
        startingOfficewatchEl,
        "Officewatch"
    );

    setSelectOptions(
        startingOperationEl,
        "Operation"
    );

    setSelectOptions(
        startingLiaisonEl,
        "Liaison"
    );

    setSelectOptions(
        startingOodEl,
        "OOD"
    );

    setSelectOptions(
        startingWeekendOwEl,
        "Officewatch"
    );

    setSelectOptions(
        startingWeekendLiaisonEl,
        "Liaison"
    );
}

function getStartingIndex(pool,person){
    if(!person)
        return -1;

    return pool.findIndex(
        item=>Number(item.id)===Number(person.id)
    );
}

function generatePoolSequence(type,startPerson,days){
    const pool=getPool(type);

    if(!pool.length||!startPerson)
        return [];

    const startIndex=getStartingIndex(
        pool,
        startPerson
    );

    if(startIndex===-1)
        return [];

    const result=[];

    for(let i=0;i<days;i++){
        result.push(
            pool[(startIndex+i)%pool.length]
        );
    }

    return result;
}

function generateBCSequence(type,startPerson,days,patternKey){
    const result=[];

    if(!startPerson)
        return result;

    const startGroup=getBCGroup(startPerson);

    if(!startGroup){
        return result;
    }

    const firstPattern=BC_PATTERN[0];

    if(firstPattern[patternKey]!==startGroup){
        return result;
    }

    let currentPerson=startPerson;

    for(let day=0;day<days;day++){
        const pattern=
            BC_PATTERN[day%BC_PATTERN.length];

        const requiredGroup=
            pattern[patternKey];

        const pool=getPool(
            type,
            requiredGroup
        );

        if(!pool.length){
            result.push(null);
            continue;
        }

        if(day===0){
            result.push(currentPerson);
            continue;
        }

        const index=pool.findIndex(
            person=>Number(person.id)===Number(currentPerson.id)
        );

        if(index!==-1){
            currentPerson=
                pool[(index+1)%pool.length];
        }else{
            currentPerson=pool[0];
        }

        result.push(currentPerson);
    }

    return result;
}

function generateWeekendSequence(startPerson,days,type){
    const result=[];
    const pool=getPool(type);

    if(!pool.length||!startPerson)
        return Array(days).fill(null);

    const startIndex=pool.findIndex(
        person=>Number(person.id)===Number(startPerson.id)
    );

    if(startIndex===-1)
        return Array(days).fill(null);

    let currentIndex=startIndex;

    for(let i=0;i<days;i++){
        result.push(pool[currentIndex]);

        currentIndex=
            (currentIndex+1)%pool.length;
    }

    return result;
}

function generateRoster(){
    if(!isCg5Admin())return;
    const startDate=startDateEl.value;
    const numberDays=Number(numberDaysEl.value);

    if(!startDate){
        generatorStatus.textContent="Please select a Starting Date.";
        return;
    }

    if(!numberDays||numberDays<1){
        generatorStatus.textContent="Please enter a valid Number of Days.";
        return;
    }

    const powStart=findSelectedPerson(
        startingPowEl,
        "POW"
    );

    const officewatchStart=findSelectedPerson(
        startingOfficewatchEl,
        "Officewatch"
    );

    const operationStart=findSelectedPerson(
        startingOperationEl,
        "Operation"
    );

    const liaisonStart=findSelectedPerson(
        startingLiaisonEl,
        "Liaison"
    );

    const oodStart=findSelectedPerson(
        startingOodEl,
        "OOD"
    );

    const weekendOwStart=findSelectedPerson(
        startingWeekendOwEl,
        "Officewatch"
    );

    const weekendLiaisonStart=findSelectedPerson(
        startingWeekendLiaisonEl,
        "Liaison"
    );

    if(!powStart){
        generatorStatus.textContent="Please select a valid POW Starting personnel.";
        return;
    }

    if(!officewatchStart){
        generatorStatus.textContent="Please select a valid Office Watch Starting personnel.";
        return;
    }

    if(!operationStart){
        generatorStatus.textContent="Please select a valid Operation Starting personnel.";
        return;
    }

    if(!liaisonStart){
        generatorStatus.textContent="Please select a valid Liaison Starting personnel.";
        return;
    }

    if(!oodStart){
        generatorStatus.textContent="Please select a valid Weekend OOD Starting personnel.";
        return;
    }

    if(!weekendOwStart){
        generatorStatus.textContent="Please select a valid Weekend OW/OPS Starting personnel.";
        return;
    }

    if(!weekendLiaisonStart){
        generatorStatus.textContent="Please select a valid Weekend Liaison Starting personnel.";
        return;
    }

    const firstPattern=BC_PATTERN[0];

    if(getBCGroup(officewatchStart)!==firstPattern.ow){
        generatorStatus.textContent=
            `Office Watch starting personnel must belong to Group ${firstPattern.ow} for the first rotation day.`;
        return;
    }

    if(getBCGroup(operationStart)!==firstPattern.operation){
        generatorStatus.textContent=
            `Operation starting personnel must belong to Group ${firstPattern.operation} for the first rotation day.`;
        return;
    }

    const powSequence=
        generatePoolSequence(
            "POW",
            powStart,
            numberDays
        );

    const officewatchSequence=
        generateBCSequence(
            "Officewatch",
            officewatchStart,
            numberDays,
            "ow"
        );

    const operationSequence=
        generateBCSequence(
            "Operation",
            operationStart,
            numberDays,
            "operation"
        );

    const liaisonSequence=
        generatePoolSequence(
            "Liaison",
            liaisonStart,
            numberDays
        );

    const oodSequence=
        generateWeekendSequence(
            oodStart,
            numberDays,
            "OOD"
        );

    const weekendOwSequence=
        generateWeekendSequence(
            weekendOwStart,
            numberDays,
            "Officewatch"
        );

    const weekendLiaisonSequence=
        generateWeekendSequence(
            weekendLiaisonStart,
            numberDays,
            "Liaison"
        );

    if(
        powSequence.length!==numberDays||
        officewatchSequence.length!==numberDays||
        operationSequence.length!==numberDays||
        liaisonSequence.length!==numberDays||
        oodSequence.length!==numberDays||
        weekendOwSequence.length!==numberDays||
        weekendLiaisonSequence.length!==numberDays
    ){
        generatorStatus.textContent=
            "Unable to generate the complete rotation. Please check the selected starting personnel.";
        return;
    }

    generatedRoster=[];

    for(let i=0;i<numberDays;i++){
        const date=
            addDays(
                parseDateKey(startDate),
                i
            );

        const dateKey=
            formatDateKey(date);

        const weekend=isWeekend(date);

        const assignments=[];

        if(weekend){
            assignments.push({
                label:"Duty OOD",
                person:oodSequence[i]
            });

            assignments.push({
                label:"Duty OW/Operation",
                person:weekendOwSequence[i]
            });

            assignments.push({
                label:"Duty Liaison",
                person:weekendLiaisonSequence[i]
            });
        }else{
            assignments.push({
                label:"Duty POW",
                person:powSequence[i]
            });

            assignments.push({
                label:"Duty OW",
                person:officewatchSequence[i]
            });

            assignments.push({
                label:"Duty Operation",
                person:operationSequence[i]
            });

            assignments.push({
                label:"Duty Liaison",
                person:liaisonSequence[i]
            });
        }

        generatedRoster.push({
            date:dateKey,
            weekend,
            assignments
        });
    }

    generatorStatus.textContent=
        `${generatedRoster.length} days generated successfully.`;

    applyBtn.disabled=false;

    renderRoster();
}

function escapeHtml(value){
    return String(value??"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function renderRoster(){
    if(!generatedRoster.length){
        rosterSummary.classList.add("hidden");

        rosterPreview.innerHTML=`
            <div class="empty-preview">
                <div class="empty-icon">↻</div>
                <h3>No roster generated</h3>
                <p>Select your starting personnel and click <strong>Generate Roster</strong>.</p>
            </div>
        `;

        return;
    }

    const weekdayCount=
        generatedRoster.filter(
            item=>!item.weekend
        ).length;

    const weekendCount=
        generatedRoster.filter(
            item=>item.weekend
        ).length;

    rosterSummary.classList.remove("hidden");

    rosterSummary.innerHTML=`
        <div class="summary-card">
            <div class="summary-label">Starting Date</div>
            <div class="summary-value">
                ${escapeHtml(formatLongDate(generatedRoster[0].date))}
            </div>
        </div>

        <div class="summary-card">
            <div class="summary-label">Days Generated</div>
            <div class="summary-value">
                ${generatedRoster.length}
            </div>
        </div>

        <div class="summary-card">
            <div class="summary-label">Weekdays</div>
            <div class="summary-value">
                ${weekdayCount}
            </div>
        </div>

        <div class="summary-card">
            <div class="summary-label">Weekend Days</div>
            <div class="summary-value">
                ${weekendCount}
            </div>
        </div>
    `;

    rosterPreview.innerHTML=
        generatedRoster.map(day=>{
            const assignments=
                day.assignments.map(item=>{
                    const person=item.person;

                    if(!person){
                        return`
                            <div class="roster-assignment">
                                <div class="assignment-label">
                                    ${escapeHtml(item.label)}
                                </div>

                                <div class="assignment-person">
                                    No available personnel
                                </div>
                            </div>
                        `;
                    }

                    return`
                        <div class="roster-assignment">
                            <div class="assignment-label">
                                ${escapeHtml(item.label)}
                            </div>

                            <div class="assignment-person">
                                ${escapeHtml(person.full_name_rank)}
                            </div>

                            <div class="assignment-serial">
                                ${escapeHtml(person.serial_number)}
                            </div>
                        </div>
                    `;
                }).join("");

            return`
                <div class="roster-day">
                    <div class="roster-day-header">
                        <div class="roster-date">
                            ${escapeHtml(formatLongDate(day.date))}
                        </div>

                        <span class="roster-day-type">
                            ${day.weekend?"WEEKEND":"WEEKDAY"}
                        </span>
                    </div>

                    <div class="roster-assignments">
                        ${assignments}
                    </div>
                </div>
            `;
        }).join("");
}

function applyToDutyCalendar(){
    if(!isCg5Admin())return;
    if(!generatedRoster.length){
        generatorStatus.textContent=
            "Please generate a roster first.";

        return;
    }

    const startDate=startDateEl.value;

    const config={
        appliedAt:new Date().toISOString(),
        startDate,
        numberDays:Number(numberDaysEl.value),

        startingPersonnel:{
            pow:Number(startingPowEl.value),
            officewatch:Number(startingOfficewatchEl.value),
            operation:Number(startingOperationEl.value),
            liaison:Number(startingLiaisonEl.value),
            ood:Number(startingOodEl.value),
            weekendOw:Number(startingWeekendOwEl.value),
            weekendLiaison:Number(startingWeekendLiaisonEl.value)
        }
    };

    localStorage.setItem(
        "cg5DutyRotationConfig",
        JSON.stringify(config)
    );

    localStorage.setItem(
        "cg5DutyRotationRoster",
        JSON.stringify(generatedRoster)
    );

    generatorStatus.textContent=
        "Duty rotation applied successfully. Opening Duty Calendar...";

    setTimeout(()=>{
        window.location.href="duty-calendar.html";
    },500);
}

function clearGenerator(){
    if(!isCg5Admin())return;
    startDateEl.value="2026-09-28";
    numberDaysEl.value="30";

    startingPowEl.value="";
    startingOfficewatchEl.value="";
    startingOperationEl.value="";
    startingLiaisonEl.value="";

    startingOodEl.value="";
    startingWeekendOwEl.value="";
    startingWeekendLiaisonEl.value="";

    generatedRoster=[];

    applyBtn.disabled=true;

    generatorStatus.textContent="";

    renderRoster();
}

async function loadPersonnel(){
    generatorStatus.textContent="Loading personnel...";

    const{data,error}=await supabaseClient
        .from("duty_personnel")
        .select(
            "id, serial_number, full_name_rank, duty, desk, created_at"
        );

    if(error){
        console.error(error);

        personnel=[];

        generatorStatus.textContent=
            `Unable to load personnel: ${error.message}`;

        return;
    }

    personnel=sortPersonnel(
        (data||[]).map(person=>({
            ...person,
            duty:normalizeDuty(person.duty)
        }))
    );

    loadAllPersonnelOptions();

    generatorStatus.textContent=
        `${personnel.length} personnel loaded.`;
}

generateBtn.addEventListener(
    "click",
    generateRoster
);

applyBtn.addEventListener(
    "click",
    applyToDutyCalendar
);

clearBtn.addEventListener(
    "click",
    clearGenerator
);

async function initialize(){
    try{
        const access=await window.cg5Access?.ready;
        if(!access)return;
        applyBtn.disabled=true;

        await loadPersonnel();
    }catch(error){
        console.error(
            "Duty Rotation Generator initialization error:",
            error
        );

        generatorStatus.textContent=
            "Unable to initialize Duty Rotation Generator.";
    }
}

initialize();

window.cg5DutyRotationGenerator={
    getRoster:()=>JSON.parse(
        JSON.stringify(generatedRoster)
    ),
    getPersonnel:()=>JSON.parse(
        JSON.stringify(personnel)
    ),
    generate:generateRoster,
    apply:applyToDutyCalendar,
    clear:clearGenerator
};
