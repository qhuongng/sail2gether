import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import { faqData } from "@/constants/faq";

import Button from "@/components/button";

const FAQ = () => {
    const [showScrollToTop, setShowScrollToTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            // Get the layout content from RootLayout
            const scrollContainer = document.querySelector("#layout-content") as HTMLElement;
            const scrollY = scrollContainer ? scrollContainer.scrollTop : window.scrollY;

            // Show button when user scrolls down more than 10px
            const shouldShow = scrollY > 10;
            setShowScrollToTop(shouldShow);
        };

        // Add event listener to the correct scroll container
        const scrollContainer = document.querySelector("#layout-content") as HTMLElement;

        if (scrollContainer) {
            scrollContainer.addEventListener("scroll", handleScroll);
            return () => scrollContainer.removeEventListener("scroll", handleScroll);
        } else {
            // Fallback to window scroll if container not found
            window.addEventListener("scroll", handleScroll);
            return () => window.removeEventListener("scroll", handleScroll);
        }
    }, []);

    const scrollToTop = () => {
        const scrollContainer = document.querySelector("#layout-content") as HTMLElement;

        if (scrollContainer) {
            scrollContainer.scrollTo({
                top: 0,
                left: 0,
                behavior: "smooth",
            });
        } else {
            // Fallback to window scroll if container not found
            window.scrollTo({
                top: 0,
                left: 0,
                behavior: "smooth",
            });
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-12 min-h-screen flex flex-col justify-center">
            <div className="flex flex-col sm:flex-row justify-between gap-4 mb-4">
                <div className="flex flex-col sm:mb-8 mb-0">
                    <h1 className="font-bold text-3xl">not frequently asked questions,</h1>
                    <p className="mt-4">but I'll answer them anyway since I love yapping.</p>
                </div>

                <Link
                    className="btn border-2 border-base-300 py-0 px-2 whitespace-nowrap self-start sm:self-auto mb-8 sm:mb-0"
                    to="/"
                >
                    Get me out of here!!!
                </Link>
            </div>

            {faqData.map((faq, index) => (
                <div
                    key={index}
                    className={`collapse collapse-plus border-2 p-2 ${index === 0 ? "" : "mt-4"}`}
                >
                    <input type="radio" name="faq" />
                    <div
                        className="collapse-title text-lg"
                        dangerouslySetInnerHTML={{ __html: faq.title }}
                    />
                    <div
                        className="collapse-content"
                        dangerouslySetInnerHTML={{ __html: faq.content }}
                    />
                </div>
            ))}

            {/* Scroll to top button */}
            <Button
                onClick={scrollToTop}
                className={`fixed bottom-6 right-8 transition-opacity duration-100 ease-in-out z-50 ${
                    showScrollToTop ? "opacity-100" : "opacity-0"
                }`}
            >
                Pull me up
            </Button>
        </div>
    );
};

export default FAQ;
