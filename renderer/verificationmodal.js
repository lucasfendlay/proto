// Function to check if all household questions are answered
function areHouseholdQuestionsAnswered() {
    const questions = document.querySelectorAll('selection-box');
    for (let question of questions) {
        if (!question.value) {
            return false;
        }
    }
    return true;
}

// Function to open the modal
function openModal() {
    const modal = document.getElementById('verificationModal');
    modal.style.display = 'block';
}

// Function to handle the modal opening process
function handleModalOpen() {
    if (areHouseholdQuestionsAnswered()) {
        openModal();
    } else {
        alert('Please answer all household questions before proceeding.');
    }
}

// Add event listener to the button that triggers the modal
document.getElementById('openModalButton').addEventListener('click', handleModalOpen);