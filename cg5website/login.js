/* =========================================================
   CG-5 LOGIN
   SUPABASE AUTHENTICATION
========================================================= */

const SUPABASE_URL =
  "https://qxiufjlserfxgblftieb.supabase.co";

const SUPABASE_KEY =
 "sb_publishable_H0hMUqF1YM5rUT9cdLAqJA_qiQfNznA";

/* =========================================================
   SUPABASE CLIENT
========================================================= */

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


/* =========================================================
   ELEMENTS
========================================================= */

const loginForm =
  document.getElementById("login-form");

const emailInput =
  document.getElementById("email");

const passwordInput =
  document.getElementById("password");

const loginButton =
  document.getElementById("login-button");

const loginButtonText =
  document.getElementById("login-button-text");

const loginStatus =
  document.getElementById("login-status");

const togglePassword =
  document.getElementById("toggle-password");


/* =========================================================
   SHOW / HIDE PASSWORD
========================================================= */

togglePassword.addEventListener(
  "click",
  function () {

    const isPassword =
      passwordInput.type === "password";

    passwordInput.type =
      isPassword ? "text" : "password";

    togglePassword.textContent =
      isPassword ? "HIDE" : "SHOW";

    togglePassword.setAttribute(
      "aria-label",
      isPassword
        ? "Hide password"
        : "Show password"
    );

  }
);


/* =========================================================
   LOGIN
========================================================= */

async function loginUser(event) {

  event.preventDefault();


  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;


  /* -------------------------------------------------------
     CLEAR STATUS
  ------------------------------------------------------- */

  loginStatus.textContent = "";


  /* -------------------------------------------------------
     VALIDATE INPUT
  ------------------------------------------------------- */

  if (!email || !password) {

    loginStatus.textContent =
      "Please enter your email and password.";

    return;

  }


  /* -------------------------------------------------------
     DISABLE BUTTON
  ------------------------------------------------------- */

  loginButton.disabled = true;

  loginButtonText.textContent =
    "SIGNING IN...";


  try {

    /* -----------------------------------------------------
       SUPABASE LOGIN
    ----------------------------------------------------- */

    const {
      data,
      error
    } =
      await supabaseClient.auth.signInWithPassword({

        email: email,

        password: password

      });


    /* -----------------------------------------------------
       LOGIN ERROR
    ----------------------------------------------------- */

    if (error) {

      console.error(
        "Supabase login error:",
        error
      );

      loginStatus.textContent =
        error.message;

      loginButton.disabled = false;

      loginButtonText.textContent =
        "SIGN IN";

      return;

    }


    /* -----------------------------------------------------
       LOGIN SUCCESS
    ----------------------------------------------------- */

    console.log(
      "LOGIN SUCCESS:",
      data.user
    );


    /* -----------------------------------------------------
       VERIFY SESSION
    ----------------------------------------------------- */

    const {
      data: sessionData,
      error: sessionError
    } =
      await supabaseClient.auth.getSession();


    if (sessionError) {

      console.error(
        "Session verification error:",
        sessionError
      );

      loginStatus.textContent =
        sessionError.message;

      loginButton.disabled = false;

      loginButtonText.textContent =
        "SIGN IN";

      return;

    }


    /* -----------------------------------------------------
       REDIRECT AFTER SUCCESSFUL LOGIN
    ----------------------------------------------------- */

    if (sessionData.session) {

      loginButtonText.textContent =
        "SUCCESS";

      loginStatus.textContent =
        "Login successful. Opening dashboard...";


      console.log(
        "SESSION CONFIRMED"
      );


      /*
         Redirect to dashboard.

         Keep this as a relative path so the same code
         works with Live Server, GitHub Pages, Netlify,
         or another static web host.
      */

      setTimeout(function () {

        window.location.href =
          "dashboard.html";

      }, 300);


      return;

    }


    /* -----------------------------------------------------
       NO SESSION
    ----------------------------------------------------- */

    loginStatus.textContent =
      "Login succeeded but no session was created.";

    loginButton.disabled = false;

    loginButtonText.textContent =
      "SIGN IN";


  } catch (error) {

    /* -----------------------------------------------------
       UNEXPECTED ERROR
    ----------------------------------------------------- */

    console.error(
      "Unexpected login error:",
      error
    );

    loginStatus.textContent =
      "Something went wrong. Please try again.";

    loginButton.disabled = false;

    loginButtonText.textContent =
      "SIGN IN";

  }

}


/* =========================================================
   FORM SUBMIT
========================================================= */

loginForm.addEventListener(
  "submit",
  loginUser
);