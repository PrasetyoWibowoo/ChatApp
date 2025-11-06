// WebRTC service for voice and video calls
import { createSignal } from 'solid-js';

export type CallType = 'voice' | 'video';

export interface CallState {
  isInCall: boolean;
  callType: CallType | null;
  isMuted: boolean;
  isVideoOff: boolean;
  remoteUserId: string | null;
  remoteUsername: string | null;
  isRinging: boolean;
  isIncoming: boolean;
}

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private ws: WebSocket | null = null;
  private roomId: string | null = null;

  // ICE servers (using free Google STUN server)
  private iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  // State
  public callState = createSignal<CallState>({
    isInCall: false,
    callType: null,
    isMuted: false,
    isVideoOff: false,
    remoteUserId: null,
    remoteUsername: null,
    isRinging: false,
    isIncoming: false,
  });

  setWebSocket(ws: WebSocket | null, roomId: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('[WebRTC] Cannot set WebSocket - not connected');
      return;
    }
    this.ws = ws;
    this.roomId = roomId;
    console.log('[WebRTC] WebSocket set successfully for room:', roomId);
  }

  async startCall(callType: CallType, remoteUserId: string, remoteUsername: string) {
    try {
      console.log(`[WebRTC] Starting ${callType} call to ${remoteUsername}`);

      // Get user media
      const constraints = {
        audio: true,
        video: callType === 'video',
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create peer connection
      this.peerConnection = new RTCPeerConnection(this.iceServers);

      // Add local stream tracks to peer connection
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws) {
          this.ws.send(JSON.stringify({
            type: 'call-ice-candidate',
            candidate: event.candidate,
            target_user_id: remoteUserId,
          }));
        }
      };

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log('[WebRTC] Received remote track');
        this.remoteStream = event.streams[0];
        const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
        if (remoteVideo) {
          remoteVideo.srcObject = this.remoteStream;
        }
      };

      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Send offer via WebSocket
      if (this.ws) {
        const offerMessage = {
          type: 'call-offer',
          call_type: callType,
          offer: offer,
          target_user_id: remoteUserId,
          caller_username: localStorage.getItem('username'),
        };
        console.log('[WebRTC] Sending offer:', offerMessage);
        this.ws.send(JSON.stringify(offerMessage));
      }

      // Update state
      const [, setCallState] = this.callState;
      setCallState({
        isInCall: true,
        callType,
        isMuted: false,
        isVideoOff: false,
        remoteUserId,
        remoteUsername,
        isRinging: true,
        isIncoming: false,
      });

      // Attach local stream to video element
      const localVideo = document.getElementById('local-video') as HTMLVideoElement;
      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }

    } catch (error) {
      console.error('[WebRTC] Failed to start call:', error);
      alert('Failed to access camera/microphone. Please grant permissions.');
      this.endCall();
    }
  }

  async handleCallOffer(offer: RTCSessionDescriptionInit, callType: CallType, remoteUserId: string, remoteUsername: string) {
    try {
      console.log(`[WebRTC] Received ${callType} call from ${remoteUsername}`);

      // Update state to show incoming call
      const [, setCallState] = this.callState;
      setCallState({
        isInCall: false,
        callType,
        isMuted: false,
        isVideoOff: false,
        remoteUserId,
        remoteUsername,
        isRinging: true,
        isIncoming: true,
      });

      // Play ringtone (optional)
      // const ringtone = new Audio('/notification/ringtone.mp3');
      // ringtone.loop = true;
      // ringtone.play();

    } catch (error) {
      console.error('[WebRTC] Failed to handle call offer:', error);
    }
  }

  async acceptCall(offer: RTCSessionDescriptionInit, callType: CallType) {
    try {
      console.log('[WebRTC] Accepting call');

      const [callStateGetter, setCallState] = this.callState;
      const callStateValue = callStateGetter(); // Get current state

      // Get user media
      const constraints = {
        audio: true,
        video: callType === 'video',
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create peer connection
      this.peerConnection = new RTCPeerConnection(this.iceServers);

      // Add local stream tracks
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws) {
          this.ws.send(JSON.stringify({
            type: 'call-ice-candidate',
            candidate: event.candidate,
            target_user_id: callStateValue.remoteUserId,
          }));
        }
      };

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log('[WebRTC] Received remote track');
        this.remoteStream = event.streams[0];
        const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
        if (remoteVideo) {
          remoteVideo.srcObject = this.remoteStream;
        }
      };

      // Set remote description
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Send answer via WebSocket
      if (this.ws) {
        this.ws.send(JSON.stringify({
          type: 'call-answer',
          answer: answer,
          target_user_id: callStateValue.remoteUserId,
        }));
      }

      // Update state
      setCallState(prev => ({
        ...prev,
        isInCall: true,
        isRinging: false,
        isIncoming: false,
      }));

      // Attach local stream to video element
      const localVideo = document.getElementById('local-video') as HTMLVideoElement;
      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }

    } catch (error) {
      console.error('[WebRTC] Failed to accept call:', error);
      alert('Failed to access camera/microphone. Please grant permissions.');
      this.rejectCall();
    }
  }

  async handleCallAnswer(answer: RTCSessionDescriptionInit) {
    try {
      console.log('[WebRTC] Received call answer');
      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        
        // Update state - call connected
        const [, setCallState] = this.callState;
        setCallState(prev => ({
          ...prev,
          isRinging: false,
        }));
      }
    } catch (error) {
      console.error('[WebRTC] Failed to handle call answer:', error);
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('[WebRTC] Failed to add ICE candidate:', error);
    }
  }

  rejectCall() {
    console.log('[WebRTC] Rejecting call');
    const [callStateGetter] = this.callState;
    const callStateValue = callStateGetter();
    
    // Notify remote user
    if (this.ws && callStateValue.remoteUserId) {
      this.ws.send(JSON.stringify({
        type: 'call-rejected',
        target_user_id: callStateValue.remoteUserId,
      }));
    }

    this.endCall();
  }

  endCall() {
    console.log('[WebRTC] Ending call');

    const [callStateGetter] = this.callState;
    const callStateValue = callStateGetter();

    // Notify remote user if in call
    if (this.ws && callStateValue.isInCall && callStateValue.remoteUserId) {
      this.ws.send(JSON.stringify({
        type: 'call-ended',
        target_user_id: callStateValue.remoteUserId,
      }));
    }

    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Reset state
    const [, setCallStateEnd] = this.callState;
    setCallStateEnd({
      isInCall: false,
      callType: null,
      isMuted: false,
      isVideoOff: false,
      remoteUserId: null,
      remoteUsername: null,
      isRinging: false,
      isIncoming: false,
    });
  }

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const [, setCallStateMute] = this.callState;
        setCallStateMute(prev => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const [, setCallStateVideo] = this.callState;
        setCallStateVideo(prev => ({ ...prev, isVideoOff: !videoTrack.enabled }));
      }
    }
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }
}

export const webrtcService = new WebRTCService();
