(async () => {
    try {
        const res = await fetch('http://localhost:3001/api/players', { method: 'POST' });
        console.log('status', res.status);
        const txt = await res.text();
        console.log('body', txt);
    } catch (err) {
        console.error('error', err);
    }
})();
