/* Shared Supabase role check for Admin and read-only User accounts. */
(() => {
    const SUPABASE_URL = "https://qxiufjlserfxgblftieb.supabase.co";
    const SUPABASE_KEY = "sb_publishable_H0hMUqF1YM5rUT9cdLAqJA_qiQfNznA";

    const client = window.cg5Supabase || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.cg5Supabase = client;

    const roleStyle = document.createElement("style");
    roleStyle.textContent = `
        body:not(.access-admin) [data-admin-only],
        body:not(.access-admin) button[data-action],
        body:not(.access-admin) button[data-special-delete],
        body:not(.access-admin) #save-special-duty,
        body:not(.access-admin) #generate-rotation-btn,
        body:not(.access-admin) #apply-rotation-btn,
        body:not(.access-admin) #generate-btn,
        body:not(.access-admin) #apply-btn,
        body:not(.access-admin) #clear-btn { display: none !important; }
        body.access-user #generate-duty-btn { display: none !important; }
        .cg5-readonly-banner { position: fixed; right: 14px; bottom: 14px; z-index: 5000; padding: 8px 12px; border-radius: 8px; background: #eaf4f8; color: #005b82; font: 700 12px system-ui; box-shadow: 0 4px 14px rgba(16,42,67,.12); }
    `;
    document.head.appendChild(roleStyle);

    let currentRole = null;
    let currentUser = null;
    let ready = null;

    function showAccessMessage(message) {
        let notice = document.getElementById("cg5-access-notice");
        if (!notice) {
            notice = document.createElement("div");
            notice.id = "cg5-access-notice";
            notice.setAttribute("role", "status");
            notice.style.cssText = "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:#f4f8fa;color:#12313f;font:600 16px system-ui;text-align:center";
            document.body.appendChild(notice);
        }
        notice.textContent = message;
    }

    async function initialize() {
        document.body.classList.add("access-pending");

        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError || !sessionData?.session?.user) {
            window.location.replace("index.html");
            return null;
        }

        currentUser = sessionData.session.user;
        const { data: roleRow, error: roleError } = await client
            .from("cg5_user_roles")
            .select("role")
            .eq("user_id", currentUser.id)
            .maybeSingle();

        if (roleError || !roleRow || !["admin", "user"].includes(roleRow.role)) {
            document.body.classList.remove("access-pending");
            document.body.classList.add("access-unassigned");
            showAccessMessage(roleError
                ? "Kailangan munang patakbuhin ang updated supabase-admin-status.sql sa Supabase SQL Editor para ma-set up ang Admin at User access."
                : "Wala pang naka-assign na Admin o User role sa account na ito. Ipa-check ang email mapping sa supabase-admin-status.sql.");
            console.error("CG-5 role lookup failed:", roleError);
            return null;
        }

        currentRole = roleRow.role;
        document.body.classList.remove("access-pending", "access-unassigned");
        document.body.classList.add(currentRole === "admin" ? "access-admin" : "access-user");

        if (currentRole === "user") {
            const banner = document.createElement("div");
            banner.className = "cg5-readonly-banner";
            banner.textContent = "View only access";
            document.body.appendChild(banner);
        }

        document.dispatchEvent(new CustomEvent("cg5accessready", {
            detail: { role: currentRole, user: currentUser }
        }));
        return { role: currentRole, user: currentUser };
    }

    ready = initialize().catch(error => {
        document.body.classList.remove("access-pending");
        document.body.classList.add("access-unassigned");
        showAccessMessage("Hindi ma-verify ang account access. Subukang i-refresh ang page.");
        console.error("CG-5 access initialization failed:", error);
        return null;
    });

    window.cg5Access = {
        ready,
        get role() { return currentRole; },
        get user() { return currentUser; },
        isAdmin() { return currentRole === "admin"; },
        async requireAdmin() {
            await ready;
            if (currentRole === "admin") return true;
            return false;
        }
    };

    document.addEventListener("click", async event => {
        const logoutLink = event.target.closest("a.logout");
        if (!logoutLink) return;
        event.preventDefault();
        await client.auth.signOut();
        window.location.href = "index.html";
    });
})();
