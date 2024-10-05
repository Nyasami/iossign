document.getElementById('signForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!document.querySelector('.app-button.active')) {
        alert('Please select an app.');
        return;
    }

    const form = document.getElementById('signForm');
    const formData = new FormData(form);
    console.log(formData);
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        }).then(res => res.json());

        const downloadButton = document.querySelector('.download-link');
        console.log(response);

        if (response) {
            setTimeout(() => {
                downloadButton.setAttribute('href', response["otaLink"]);
                downloadButton.innerHTML = `<a href="${response["otaLink"]}" target="_blank">Download</a>`;
                downloadButton.style.display = 'block';
            }, 1000);
        } else {
            alert(`${response.statusText}`);
        }
    } catch (err) {
        console.error('Error:', err);
        alert(err);
    }
});
function selectApp(button) {
    // Deselect all buttons
    document.querySelectorAll('.app-button').forEach(btn => btn.classList.remove('active'));
    
    // Select clicked button
    button.classList.add('active');
    
    // Automatically select the radio input within the clicked button
    button.querySelector('input[type="radio"]').checked = true;
}
const fileInput = document.getElementById('zipFile');
const fileStatus = document.getElementById('fileStatus');


// Listen for file selection
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        // Display file name when a file is selected
        fileStatus.textContent = `File selected: ${fileInput.files[0].name}`;
    } else {
        fileStatus.textContent = 'No file selected';
    }
});