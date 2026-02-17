(function () {
  console.log('[CRM Extension] Injector script loaded');

  const methods = ['log', 'info', 'debug', 'warn'];
  let lastProcessedPhone = null;
  let lastProcessedTime = 0;
  const DUPLICATE_THRESHOLD = 2000;

  const BLOCKED_NUMBERS = new Set([
    '596922421',
    '596922420',
  ]);

  function isBlockedNumber(phone) {
    const digits = phone.replace(/\D/g, '');

    for (const blocked of BLOCKED_NUMBERS) {
      if (digits.endsWith(blocked)) {
        console.log('[CRM Extension] ✗ Blocked number (agent):', digits);
        return true;
      }
    }

    return false;
  }

  methods.forEach(function (method) {
    const original = console[method];

    console[method] = function () {
      const args = Array.from(arguments);

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // Check for object with phone_number
        if (typeof arg === 'object' && arg !== null && arg.phone_number) {

          let phone = arg.phone_number;
          const type = arg.type || 'unknown';

          if (arg.FCNumber) {
            const phoneDigits = phone.replace(/\D/g, '');
            const fcNumberDigits = arg.FCNumber.replace(/\D/g, '');

            if (phoneDigits === fcNumberDigits) {
              console.log('[CRM Extension] Skipping: phone_number matches FCNumber (agent number)');
              return original.apply(console, args);
            } else {
              console.log('[CRM Extension] FCNumber exists but phone_number is different - processing call');
            }
          }

          const isIncoming =
            type === 'incoming' ||
            arg.direction === 'inbound' ||
            arg.event === 'incoming_call' ||
            (arg.status && arg.status.includes('incoming'));

          if (isIncoming) {
            // Priority order for incoming calls
            if (arg.caller_id) {
              phone = arg.caller_id;
              console.log('[CRM Extension] Using caller_id:', phone);
            }
            else if (arg.from) {
              phone = arg.from;
              console.log('[CRM Extension] Using from:', phone);
            }
            else if (arg.customer_number) {
              phone = arg.customer_number;
              console.log('[CRM Extension] Using customer_number:', phone);
            }
            else if (arg.remote_number) {
              phone = arg.remote_number;
              console.log('[CRM Extension] Using remote_number:', phone);
            }
            else {
              console.log('[CRM Extension] Using phone_number:', phone);
            }
          }

          // Check if number is blocked
          if (isBlockedNumber(phone)) {
            console.log('[CRM Extension] Skipping blocked number');
            return original.apply(console, args);
          }

          const isCallEvent =
            arg.event === 'call_started' ||
            arg.event === 'call_initiated' ||
            arg.event === 'call_ringing' ||
            arg.event === 'call_answered' ||
            arg.event === 'incoming_call' ||
            arg.event === 'outgoing_call' ||
            arg.status === 'ringing' ||
            arg.status === 'in_call' ||
            arg.status === 'connected' ||
            arg.status === 'calling' ||
            arg.status === 'ongoing' ||
            type === 'incoming' ||
            type === 'outgoing' ||
            arg.action === 'dial' ||
            arg.action === 'answer' ||
            arg.action === 'call' ||
            (arg.call_id && arg.phone_number) ||
            (arg.caller_id && arg.phone_number) ||
            (arg.direction && arg.phone_number);

          const isPageLoadEvent =
            arg.event === 'page_loaded' ||
            arg.event === 'init' ||
            arg.event === 'ready' ||
            arg.action === 'load' ||
            arg.action === 'init';

          if (isCallEvent && !isPageLoadEvent) {
            const now = Date.now();
            if (phone === lastProcessedPhone && (now - lastProcessedTime) < DUPLICATE_THRESHOLD) {
              console.log('[CRM Extension] Freshcaller duplicate event blocked:', phone);
              return original.apply(console, args);
            }

            lastProcessedPhone = phone;
            lastProcessedTime = now;

            console.log('[CRM Extension] ✓ Freshcaller call event detected:', {
              phone: phone,
              type: type,
              event: arg.event,
              status: arg.status,
              isIncoming: isIncoming,
              fullObject: arg,
              FCNumber: arg.FCNumber
            });

            window.dispatchEvent(new CustomEvent('freshcaller-call-detected', {
              detail: {
                phone: phone,
                type: type,
                isActualCall: true
              }
            }));
          } else if (arg.phone_number) {
            console.log('[CRM Extension] Freshcaller non-call event (ignored):', {
              phone: phone,
              event: arg.event,
              status: arg.status,
              action: arg.action
            });
          }
        }

        if (typeof arg === 'string' && arg.includes('phone_number')) {
          try {
            const parsed = JSON.parse(arg);
            if (parsed.phone_number) {

              let phone = parsed.phone_number;
              const type = parsed.type || 'unknown';

              if (parsed.FCNumber) {
                const phoneDigits = phone.replace(/\D/g, '');
                const fcNumberDigits = parsed.FCNumber.replace(/\D/g, '');

                if (phoneDigits === fcNumberDigits) {
                  console.log('[CRM Extension] JSON: Skipping - phone_number matches FCNumber');
                  return original.apply(console, args);
                } else {
                  console.log('[CRM Extension] JSON: FCNumber exists but phone_number is different - processing');
                }
              }
              const isIncoming =
                type === 'incoming' ||
                parsed.direction === 'inbound' ||
                parsed.event === 'incoming_call' ||
                (parsed.status && parsed.status.includes('incoming'));

              if (isIncoming) {
                // Priority order
                if (parsed.caller_id) {
                  phone = parsed.caller_id;
                  console.log('[CRM Extension] JSON: Using caller_id:', phone);
                }
                else if (parsed.from) {
                  phone = parsed.from;
                  console.log('[CRM Extension] JSON: Using from:', phone);
                }
                else if (parsed.customer_number) {
                  phone = parsed.customer_number;
                  console.log('[CRM Extension] JSON: Using customer_number:', phone);
                }
                else if (parsed.remote_number) {
                  phone = parsed.remote_number;
                  console.log('[CRM Extension] JSON: Using remote_number:', phone);
                }
                else {
                  console.log('[CRM Extension] JSON: Using phone_number:', phone);
                }
              }

              // Check if blocked
              if (isBlockedNumber(phone)) {
                console.log('[CRM Extension] JSON: Skipping blocked number');
                return original.apply(console, args);
              }

              const isCallEvent =
                parsed.event === 'call_started' ||
                parsed.event === 'call_initiated' ||
                parsed.event === 'call_ringing' ||
                parsed.event === 'call_answered' ||
                parsed.event === 'incoming_call' ||
                parsed.event === 'outgoing_call' ||
                parsed.status === 'ringing' ||
                parsed.status === 'in_call' ||
                parsed.status === 'connected' ||
                parsed.status === 'calling' ||
                parsed.status === 'ongoing' ||
                type === 'incoming' ||
                type === 'outgoing' ||
                parsed.action === 'dial' ||
                parsed.action === 'answer' ||
                parsed.action === 'call' ||
                (parsed.call_id && parsed.phone_number) ||
                (parsed.caller_id && parsed.phone_number) ||
                (parsed.direction && parsed.phone_number);

              const isPageLoadEvent =
                parsed.event === 'page_loaded' ||
                parsed.event === 'init' ||
                parsed.event === 'ready' ||
                parsed.action === 'load' ||
                parsed.action === 'init';

              if (isCallEvent && !isPageLoadEvent) {
                const now = Date.now();
                if (phone === lastProcessedPhone && (now - lastProcessedTime) < DUPLICATE_THRESHOLD) {
                  console.log('[CRM Extension] Freshcaller JSON duplicate event blocked:', phone);
                  return original.apply(console, args);
                }

                lastProcessedPhone = phone;
                lastProcessedTime = now;

                console.log('[CRM Extension] ✓ Freshcaller call event from JSON:', {
                  phone: phone,
                  type: type,
                  event: parsed.event,
                  status: parsed.status,
                  isIncoming: isIncoming,
                  fullObject: parsed,
                  FCNumber: parsed.FCNumber
                });

                window.dispatchEvent(new CustomEvent('freshcaller-call-detected', {
                  detail: {
                    phone: phone,
                    type: type,
                    isActualCall: true
                  }
                }));
              }
            }
          } catch (e) {
            // Not valid JSON
          }
        }
      }

      return original.apply(console, args);
    };
  });

  // WebRTC monitoring
  let lastCallTime = 0;
  const CALL_COOLDOWN = 3000;
  const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

  if (OriginalRTCPeerConnection) {
    console.log('[CRM Extension] WebRTC monitoring initialized');

    window.RTCPeerConnection = function (config, constraints) {
      const pc = new OriginalRTCPeerConnection(config, constraints);

      console.log('[CRM Extension] New RTCPeerConnection created');

      pc.addEventListener('connectionstatechange', function () {
        console.log('[CRM Extension] WebRTC connectionState:', pc.connectionState);

        if (pc.connectionState === 'connected') {
          const now = Date.now();
          if (now - lastCallTime > CALL_COOLDOWN) {
            lastCallTime = now;
            console.log('[CRM Extension] ✓ WebRTC connection established');
            window.dispatchEvent(new CustomEvent('webrtc-call-detected', {
              detail: { state: 'connected', timestamp: now }
            }));
          }
        }
      });

      pc.addEventListener('iceconnectionstatechange', function () {
        console.log('[CRM Extension] WebRTC iceConnectionState:', pc.iceConnectionState);

        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          const now = Date.now();
          if (now - lastCallTime > CALL_COOLDOWN) {
            lastCallTime = now;
            console.log('[CRM Extension] ✓ WebRTC ICE connection established');
            window.dispatchEvent(new CustomEvent('webrtc-call-detected', {
              detail: { state: 'connected', timestamp: now }
            }));
          }
        }
      });

      return pc;
    };

    window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;

    Object.keys(OriginalRTCPeerConnection).forEach(function (key) {
      window.RTCPeerConnection[key] = OriginalRTCPeerConnection[key];
    });
  } else {
    console.warn('[CRM Extension] RTCPeerConnection not available in this browser');
  }

})();