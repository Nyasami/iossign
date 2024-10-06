const appsDiv = document.getElementById('apps');

const apps = [
    {
        name: 'Esign',
        img: 'https://khoindvn.io.vn/img/pf/profile-pic.png'
    },
    {
        name: 'Scarlet',
        img: 'https://sign.certvn.com/css/scarlet-ico.png'
    }
]

const render = (app) => {
    return `<div class="app-button" data-app="${app.name}" onclick="selectApp(this)">
        <img src="${app.img}" alt="${app.name}">
        <p>${app.name}</p>
        <input type="radio" name="app" value="${app.name}">
    </div>`
}

for (let app of apps) {
    appsDiv.innerHTML += render(app);
}

