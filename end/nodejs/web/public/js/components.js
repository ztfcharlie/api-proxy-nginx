const { useState, useEffect } = React;

window.Notification = ({ message, type, onClose }) => {
    useEffect(() => {
        if (message) {
            const timer = setTimeout(onClose, 3000);
            return () => clearTimeout(timer);
        }
    }, [message, onClose]);
    if (!message) return null;
    const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    return (
        <div className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-xl z-50 fade-in flex items-center`}>
            <span className="font-medium">{message}</span>
            <button onClick={onClose} className="ml-4 opacity-80 hover:opacity-100"><i className="fas fa-times"></i></button>
        </div>
    );
};