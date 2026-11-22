import { useState, useEffect, useCallback } from 'react';

async function apiFetch(path, options) {
  options = options || {};
  var res = await fetch(path, {
    credentials: 'include',
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    method: options.method || 'GET',
    body: options.body,
  });
  var data = await res.json().catch(function() { return { error: 'HTTP ' + res.status }; });
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

export function useDigiLocker() {
  var [status,    setStatus]    = useState('idle');
  var [documents, setDocuments] = useState([]);
  var [profile,   setProfile]   = useState(null);
  var [error,     setError]     = useState(null);
  var [loading,   setLoading]   = useState(false);
  var [isMock,    setIsMock]    = useState(false);

  var checkStatus = useCallback(async function() {
    setStatus('checking');
    setError(null);
    try {
      var data = await apiFetch('/api/digilocker/status');
      if (data.connected) {
        setStatus('connected');
        setIsMock(data.isMock || false);
      } else if (data.expired) {
        setStatus('expired');
        setError('Your DigiLocker session expired. Please reconnect.');
      } else {
        setStatus('idle');
      }
    } catch (e) {
      setStatus('idle');
    }
  }, []);

  useEffect(function() {
    var params  = new URLSearchParams(window.location.search);
    var success = params.get('digilocker_success');
    var errMsg  = params.get('digilocker_error');

    if (success || errMsg) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (errMsg) {
      setStatus('error');
      setError(decodeURIComponent(errMsg));
    } else if (success === '1') {
      setStatus('connected');
      fetchDocuments();
      fetchProfile();
    } else {
      checkStatus();
    }
  }, []); // eslint-disable-line

  // IMPORTANT: window.location redirects bypass CRA proxy.
  // Must use the absolute backend URL (port 3001).
  var connect = useCallback(function() {
    setError(null);
    setLoading(true);
    var backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
    window.location.href = backendUrl + '/auth/digilocker';
  }, []);

  var fetchDocuments = useCallback(async function() {
    setLoading(true);
    setError(null);
    try {
      var data = await apiFetch('/api/digilocker/documents');
      setDocuments(data.documents || []);
      setIsMock(data._mock || false);
      setStatus('connected');
    } catch (err) {
      setError(err.message);
      if (err.message.includes('NOT_CONNECTED') || err.message.includes('Not connected')) {
        setStatus('idle');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  var fetchProfile = useCallback(async function() {
    try {
      var data = await apiFetch('/api/digilocker/profile');
      if (data.success && data.profile) {
        setProfile(data.profile);
      }
    } catch (e) {
      // non-critical
    }
  }, []);

  var fetchDocument = useCallback(async function(uri, format) {
    format = format || 'pdf';
    setLoading(true);
    setError(null);
    try {
      var url = '/api/digilocker/fetch?uri=' + encodeURIComponent(uri) + '&format=' + format;
      var res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Download failed (' + res.status + ')');
      }
      var blob    = await res.blob();
      var blobUrl = URL.createObjectURL(blob);
      var ct      = res.headers.get('content-type') || '';
      var ext     = ct.includes('xml') ? 'xml' : ct.includes('text') ? 'txt' : format;
      var a       = document.createElement('a');
      a.href      = blobUrl;
      a.download  = 'digilocker-' + uri.split('.').pop() + '.' + ext;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  var disconnect = useCallback(async function() {
    setLoading(true);
    try { await apiFetch('/api/digilocker/disconnect', { method: 'POST' }); }
    catch (e) {}
    finally {
      setDocuments([]);
      setProfile(null);
      setStatus('idle');
      setError(null);
      setIsMock(false);
      setLoading(false);
    }
  }, []);

  return { status, documents, profile, error, loading, isMock, connect, fetchDocuments, fetchProfile, fetchDocument, disconnect };
}
