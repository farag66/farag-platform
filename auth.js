// حماية كل الصفحات - لازم تكون مسجل دخول
(function(){
  // لو احنا في صفحة اللوجين نفسها، متعملش حاجة
  if(window.location.pathname.includes('login.html') || window.location.pathname === '/' || window.location.pathname.endsWith('index.html')){
    return;
  }
  const session = sessionStorage.getItem('farag_session');
  if(!session){
    window.location.href = 'login.html';
  }
})();

// إنشاء حساب الأدمن الافتراضي أول مرة فقط
if(!localStorage.getItem('farag_users')){
  const admin = [{
    name: 'Admin - Farag',
    email: 'admin@farag.com',
    password: btoa('Admin123!'),
    role: 'admin'
  }];
  localStorage.setItem('farag_users', JSON.stringify(admin));
}

function logout(){
  sessionStorage.removeItem('farag_session');
  window.location.href = 'login.html';
}
