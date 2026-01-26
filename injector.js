
(function() {
  const methods = ['log', 'info', 'debug', 'warn'];
  
  methods.forEach(function(method) {
    const original = console[method];
    
    console[method] = function() {
      const args = Array.from(arguments);
      
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (typeof arg === 'object' && arg !== null && arg.phone_number) {
          const phone = arg.phone_number;
          const type = arg.type || 'unknown';
          
          window.dispatchEvent(new CustomEvent('freshcaller-call-detected', {
            detail: { phone: phone, type: type }
          }));
        }
        
        if (typeof arg === 'string' && arg.includes('phone_number')) {
          try {
            const parsed = JSON.parse(arg);
            if (parsed.phone_number) {
              window.dispatchEvent(new CustomEvent('freshcaller-call-detected', {
                detail: { phone: parsed.phone_number, type: parsed.type || 'unknown' }
              }));
            }
          } catch (e) {}
        }
      }
      original.apply(console, args);
    };
  });
  
  let lastCallTime = 0;
  const CALL_COOLDOWN = 5000; 
  const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  
  if (OriginalRTCPeerConnection) {
    window.RTCPeerConnection = function(config, constraints) {
      const pc = new OriginalRTCPeerConnection(config, constraints);
      

      pc.addEventListener('connectionstatechange', function() {

        if (pc.connectionState === 'connected') {
          const now = Date.now();
          if (now - lastCallTime > CALL_COOLDOWN) {
            lastCallTime = now;
     
            window.dispatchEvent(new CustomEvent('webrtc-call-detected', {
              detail: { state: 'connected' }
            }));
          }
        }
      });
      
      pc.addEventListener('iceconnectionstatechange', function() {
        
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          const now = Date.now();
          if (now - lastCallTime > CALL_COOLDOWN) {
            lastCallTime = now;
            
            window.dispatchEvent(new CustomEvent('webrtc-call-detected', {
              detail: { state: 'connected' }
            }));
          }
        }
      });
      
      return pc;
    };
    
    window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
    
    Object.keys(OriginalRTCPeerConnection).forEach(function(key) {
      window.RTCPeerConnection[key] = OriginalRTCPeerConnection[key];
    });
    
  }
  
})();
