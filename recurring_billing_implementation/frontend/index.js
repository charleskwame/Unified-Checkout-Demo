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
    // Card type detection
    const cardNumberInput = document.getElementById("card-number");
    const cardTypeInput = document.getElementById("card-type");
    const cardTypeDisplaySpan = document.querySelector("#card-type-display span");
    // Card type detection (numeric codes)
    const detectCardType = (num) => {
        const clean = num.replace(/\s+/g, "");
        if (/^4/.test(clean)) return "001";
        if (/^5[1-5]/.test(clean)) return "002";
        if (/^3[47]/.test(clean)) return "003";
        if (/^6(?:011|5)/.test(clean)) return "004";
        return "000";
    };
    const codeToNameMap = {
        "001": "Visa",
        "002": "MasterCard",
        "003": "American Express",
        "004": "Discover",
        "000": "Unknown"
    };
    if (cardNumberInput) {
        cardNumberInput.addEventListener("input", () => {
            const code = detectCardType(cardNumberInput.value);
            if (cardTypeInput) cardTypeInput.value = code;
            if (cardTypeDisplaySpan) cardTypeDisplaySpan.textContent = codeToNameMap[code];
        });
    }
    // Duplicate detection logic removed - retained primary numeric detection implementation
});

const subscribeButton = document.getElementById("subscribeButton")

subscribeButton.addEventListener("click", async (e) => {
    e.preventDefault()
    const formData = new FormData(document.getElementById("payment-form"))
    const payload = {
        buyerInformation: {
            merchantCustomerID: formData.get("merchantCustomerID"), //USER IDENTIFIER FROM YOUR WEBSITE
            email: formData.get("buyerEmail"), //USER EMAIL FROM YOUR WEBSITE
        },
        clientReferenceInformation: {
            code: formData.get("clientReferenceCode"), //CUSTOM REFERENCE CODE
        },
        paymentInformation: {
            card: {
                number: formData.get("cardNumber"), //CARD NUMBER FROM YOUR WEBSITE
                expirationMonth: formData.get("expirationMonth"), //EXPIRATION MONTH FROM YOUR WEBSITE
                expirationYear: formData.get("expirationYear"), //EXPIRATION YEAR FROM YOUR WEBSITE
                cardType: formData.get("cardType"), //CARD TYPE FROM YOUR WEBSITE
            }
        },
        billTo: {
            firstName: formData.get("firstName"), //BILLING FIRST NAME
            lastName: formData.get("lastName"), //BILLING LAST NAME
            company: formData.get("company"), //BILLING COMPANY
            address1: formData.get("address1"), //BILLING ADDRESS
            locality: formData.get("locality"), //CITY
            administrativeArea: formData.get("administrativeArea"), //STATE/PROVINCE
            postalCode: formData.get("postalCode"), //POSTAL CODE
            country: formData.get("country"), //COUNTRY
            email: formData.get("billingEmail"), //BILLING EMAIL
            phoneNumber: formData.get("phoneNumber") //BILLING PHONE NUMBER
        }
    }

    console.log(payload)
    // return
    await fetch("http://localhost:3000/subscribe-daily", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    })
})

