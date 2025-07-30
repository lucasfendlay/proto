document.getElementById('clear-storage').addEventListener('click', function() {
    localStorage.clear();
    console.log('All local storage cleared');
    alert('All local storage has been cleared.');
});