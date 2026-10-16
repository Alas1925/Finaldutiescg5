/* =========================================================
   CG-5 DASHBOARD
   ========================================================= */

const SUPABASE_URL =
    "https://qxiufjlserfxgblftieb.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_H0hMUqF1YM5rUT9cdLAqJA_qiQfNznA";

const supabaseClient =
    window.cg5Supabase || window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


/* =========================================================
   LOGOUT
   ========================================================= */

const logoutBtn =
    document.getElementById("logoutBtn");


if (logoutBtn) {

    logoutBtn.addEventListener("click", async function () {

        try {

            const { error } =
                await supabaseClient.auth.signOut();

            if (error) {

                console.error(
                    "Logout error:",
                    error
                );

                return;
            }

            window.location.href =
                "index.html";

        } catch (error) {

            console.error(
                "Logout error:",
                error
            );

        }

    });

}
/* Home overview: reflect the calendar roster for today's real date. */
(function initHomeOverview(){
    const dutyRoot=document.getElementById("home-today-duty");
    const leaveRoot=document.getElementById("home-leave-list");
    if(!dutyRoot&&!leaveRoot)return;

    const localDate=new Date();
    const today=[localDate.getFullYear(),String(localDate.getMonth()+1).padStart(2,"0"),String(localDate.getDate()).padStart(2,"0")].join("-");
    const dateLabel=localDate.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
    const dateNode=document.getElementById("home-today-date");
    if(dateNode)dateNode.textContent=dateLabel;

    const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    const empty=(root,message,error=false)=>{if(root)root.innerHTML=`<p class="home-empty-state${error?" home-error-state":""}">${escapeHtml(message)}</p>`;};

    if(dutyRoot){
        const frame=document.getElementById("home-duty-source");
        if(!frame){
            empty(dutyRoot,"Hindi ma-load ang Duty Calendar.",true);
        }else{
            const onCalendarMessage=event=>{
                if(event.origin!==window.location.origin||event.source!==frame.contentWindow)return;
                const message=event.data;
                if(!message||message.date!==today)return;
                if(message.type==="cg5-home-duty-today-error"){
                    empty(dutyRoot,"Hindi ma-load ang aktuwal na duty roster mula sa calendar.",true);
                    window.removeEventListener("message",onCalendarMessage);
                    return;
                }
                if(message.type!=="cg5-home-duty-today")return;
                const rows=Array.isArray(message.assignments)?message.assignments:[];
                if(!rows.length){
                    empty(dutyRoot,"Walang naka-assign na duty sa calendar para sa araw na ito.");
                }else{
                    dutyRoot.innerHTML=rows.map(item=>`<div class="home-data-row"><div><strong>${escapeHtml(item.name||"Personnel")}</strong>${item.serial?`<small>Serial ${escapeHtml(item.serial)}</small>`:""}</div><span class="home-duty-label">${escapeHtml(item.label||"Duty")}${item.specialDuty?" · Special":""}</span></div>`).join("");
                }
                window.removeEventListener("message",onCalendarMessage);
            };
            window.addEventListener("message",onCalendarMessage);
            frame.src=`duty-calendar.html?embedded=admin&home=1&date=${encodeURIComponent(today)}&v=20261014-home-roster-2`;
            window.setTimeout(()=>{
                if(dutyRoot.querySelector(".home-empty-state")?.textContent.includes("Loading"))
                    empty(dutyRoot,"Hindi sumagot ang Duty Calendar. Subukang i-refresh ang page.",true);
            },12000);
        }
    }

    if(leaveRoot){
        if(!window.supabase){empty(leaveRoot,"Hindi maikonekta ang leave records.",true);return;}
        supabaseClient.from("admin_leave_monitoring")
            .select("id, end_date, reason, personnel:admin_personnel_status(rank_fullname)")
            .eq("status","Approved").lte("start_date",today).gte("end_date",today)
            .order("end_date",{ascending:true})
            .then(({data,error})=>{
                if(error){console.error("Home leave loading error:",error);empty(leaveRoot,"Hindi ma-load ang approved leave records.",true);return;}
                if(!data?.length){empty(leaveRoot,"Walang personnel na naka-leave ngayon.");return;}
                leaveRoot.innerHTML=data.map(item=>{
                    const person=Array.isArray(item.personnel)?item.personnel[0]:item.personnel;
                    const endDate=new Date(`${item.end_date}T00:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
                    return `<div class="home-data-row"><div><strong>${escapeHtml(person?.rank_fullname||"Personnel")}</strong><small>Reason: ${escapeHtml(item.reason||"—")}</small></div><span class="home-duty-label">Until ${escapeHtml(endDate)}</span></div>`;
                }).join("");
            })
            .catch(error=>{console.error("Home leave loading error:",error);empty(leaveRoot,"Hindi ma-load ang approved leave records.",true);});
    }
})();
