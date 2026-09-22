document.addEventListener('DOMContentLoaded', () => {
    const planInputs = document.querySelectorAll('.plan-input');
    const selectedPlanText = document.getElementById('selected-plan-text');
    const checkoutButton = document.getElementById('checkout-button');
    const paymentDialog = document.getElementById("payment-dialog")

    // Capitalize first letter helper
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

    // Initial setup
    const initialChecked = document.querySelector('.plan-input:checked');
    if (initialChecked && selectedPlanText) {
        selectedPlanText.textContent = capitalize(initialChecked.value);
    }

    // Update button text on change
    planInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            if (selectedPlanText) {
                selectedPlanText.textContent = capitalize(e.target.value);
            }
        });
    });

    // Checkout button logic (simulated)
    checkoutButton.addEventListener('click', (e) => {
        e.preventDefault()
        paymentDialog.showModal();
        // const selectedPlan = document.querySelector('.plan-input:checked').value;
        // const buttonOriginalText = checkoutButton.innerHTML;

        // Simulating loading state
        checkoutButton.innerHTML = `
            <svg class="spinner" viewBox="0 0 50 50" style="width: 20px; height: 20px; animation: spin 1s linear infinite;">
                <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="80" stroke-dashoffset="60"></circle>
            </svg>
            Processing...
        `;

        checkoutButton.style.opacity = '0.8';
        checkoutButton.style.pointerEvents = 'none';

        // Add a quick spin animation for the spinner
        if (!document.getElementById('spinner-style')) {
            const style = document.createElement('style');
            style.id = 'spinner-style';
            style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        // setTimeout(() => {
        //     // Restore button
        //     checkoutButton.innerHTML = buttonOriginalText;
        //     checkoutButton.style.opacity = '1';
        //     checkoutButton.style.pointerEvents = 'auto';

        //     // alert(`Proceeding to checkout with ${capitalize(selectedPlan)} plan.`);
        // }, 1500);
    });
});
