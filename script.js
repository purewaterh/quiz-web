const GAS_URL = "https://script.google.com/macros/s/AKfycby1R7TIQxkTQ1L1NTOVQe8rhkfXwu6d0VMw74tmRFwDh_RO6NZ7SJkKcW6ErwOKSR_k2w/exec"; 

let playerName = localStorage.getItem('playerName');
let questionsData = [];
let currentQuestionId = null;
let serverTimeOffset = 0; 
let uiTimer = null;

// --- 初期化処理 ---
window.onload = () => {
  if (playerName) {
    showScreen('home-screen');
    document.getElementById('display-name').innerText = playerName;
    fetchData();
  } else {
    showScreen('login-screen');
  }
};

function login() {
  const nameInput = document.getElementById('nickname-input').value.trim();
  if (!nameInput) return alert("名前を入力してください");
  playerName = nameInput;
  localStorage.setItem('playerName', playerName);
  document.getElementById('display-name').innerText = playerName;
  showScreen('home-screen');
  fetchData();
}

function showScreen(screenId) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('detail-screen').style.display = 'none';
  document.getElementById(screenId).style.display = 'block';
}

function showHomeScreen() {
  currentQuestionId = null;
  showScreen('home-screen');
  renderQuestionList();
}

// --- データ取得と表示 ---
async function fetchData() {
  try {
    const res = await fetch(GAS_URL);
    const data = await res.json();
    questionsData = data.questions;
    serverTimeOffset = data.serverTime - new Date().getTime();
    
    renderQuestionList();
    
    if (uiTimer) clearInterval(uiTimer);
    uiTimer = setInterval(updateUI, 1000);
  } catch (error) {
    alert("データの読み込みに失敗しました。再読み込みしてください。");
  }
}

function renderQuestionList() {
  const listDiv = document.getElementById('question-list');
  listDiv.innerHTML = '';
  
  questionsData.forEach(q => {
    const card = document.createElement('div');
    card.className = 'q-card';
    if (localStorage.getItem(`cleared_${q.ID}`)) {
      card.classList.add('cleared'); // クリア済みの色を変える
    }
    card.innerHTML = `<strong>Q${q.ID}. ${q.Title}</strong>`;
    card.onclick = () => openDetail(q.ID);
    listDiv.appendChild(card);
  });
}

// --- 問題詳細画面の構築 ---
function openDetail(id) {
  currentQuestionId = id;
  const q = questionsData.find(item => item.ID === id);
  if (!q) return;

  document.getElementById('detail-title').innerText = `Q${q.ID}. ${q.Title}`;
  // 改行を反映して表示
  document.getElementById('detail-description').innerHTML = q.Description.replace(/\n/g, '<br>');
  document.getElementById('detail-cooltime').innerText = q.CoolTime;
  
  const mediaDiv = document.getElementById('detail-media');
  if (q.Media) {
    mediaDiv.innerHTML = q.Media; 
    mediaDiv.style.display = 'block';
    
    // 画像ポップアップ用のクリックイベント付与
    const images = mediaDiv.querySelectorAll('img');
    images.forEach(img => {
      img.onclick = () => openModal(img.src);
    });
  } else {
    mediaDiv.style.display = 'none';
  }

  // Lyrics(multi)か通常解答かで入力枠を切り替え
  if (document.getElementById('answer-input')) document.getElementById('answer-input').value = '';
  const normalArea = document.getElementById('normal-answer-area');
  const multiArea = document.getElementById('multi-answer-area');
  
  if (q.Config && q.Config.type === 'multi') {
    normalArea.style.display = 'none';
    multiArea.style.display = 'block';
    multiArea.innerHTML = '';
    for (let i = 0; i < q.Config.required; i++) {
      multiArea.innerHTML += `<input type="text" id="multi-ans-${i}" class="multi-input" placeholder="${i+1}人目">`;
    }
  } else {
    normalArea.style.display = 'block';
    multiArea.style.display = 'none';
  }

  // クリア判定
  if (localStorage.getItem(`cleared_${q.ID}`)) {
    document.getElementById('detail-title').innerText += " 【クリア済】";
    document.getElementById('submit-btn').style.display = 'none';
  } else {
    document.getElementById('submit-btn').style.display = 'block';
  }

  showScreen('detail-screen');
  updateUI();
}

// --- 毎秒の更新処理（時間ギミック＆クールタイム） ---
function updateUI() {
  if (!currentQuestionId) return;
  const q = questionsData.find(item => item.ID === currentQuestionId);
  if (!q) return;

  const now = new Date(new Date().getTime() + serverTimeOffset);
  const dynTextDiv = document.getElementById('detail-dynamic-text');
  const mediaDiv = document.getElementById('detail-media');
  
  // 現在の正解数をカウント
  let solvedCount = 0;
  questionsData.forEach(item => {
    if (localStorage.getItem(`cleared_${item.ID}`)) solvedCount++;
  });

  if (q.Config) {
    // 1問目: 時間でヒントが増える
    if (q.Config.type === 'progressive') {
      const elapsedSec = Math.floor((now - new Date(q.Config.startTime)) / 1000);
      let revealCount = elapsedSec > 0 ? Math.floor(elapsedSec / q.Config.intervalSec) + 1 : 0; 
      let html = "";
      for (let i = 0; i < Math.min(revealCount, q.Config.hints.length); i++) {
        html += q.Config.hints[i] + "<br>";
      }
      dynTextDiv.innerHTML = html;
      dynTextDiv.style.display = html ? 'block' : 'none';
    }
    // 8問目: 他問題の正解数でヒントが増える
    else if (q.Config.type === 'solve_dependent') {
      let html = `<span style="color:#333; font-weight:normal;">現在のあなたの正解数: ${solvedCount}</span><br><br>`;
      q.Config.hints.forEach(hint => {
        if (solvedCount >= hint.req) {
          html += hint.text + "<br>";
        } else {
          html += `<span style="color:#999; font-size:12px;">※正解数${hint.req}で解放</span><br>`;
        }
      });
      dynTextDiv.innerHTML = html;
      dynTextDiv.style.display = 'block';
    }
    // 13問目: 時間で条件が消える（変わる）
    else if (q.Config.type === 'time_dependent') {
      const elapsedSec = Math.floor((now - new Date(q.Config.startTime)) / 1000);
      let phaseIndex = elapsedSec > 0 ? Math.floor(elapsedSec / q.Config.intervalSec) : 0;
      if (phaseIndex >= q.Config.phases.length) phaseIndex = q.Config.phases.length - 1;
      if (phaseIndex >= 0) {
        dynTextDiv.innerHTML = q.Config.phases[phaseIndex].text.replace(/\n/g, '<br>');
        dynTextDiv.style.display = 'block';
      }
    }
    // 5問目用: 指定時間以降に動画ヒントを公開
    if (q.Config.hintTime && now >= new Date(q.Config.hintTime) && q.Config.hintMedia) {
      if (mediaDiv.innerHTML.indexOf(q.Config.hintMedia) === -1) {
        mediaDiv.innerHTML = q.Config.hintMedia + mediaDiv.innerHTML;
        mediaDiv.style.display = 'block';
      }
    }
    // 3問目用: Q-Real
    if (q.Config.type === 'guerrilla') {
      if (now >= new Date(q.Config.revealTime)) {
        dynTextDiv.innerText = q.Config.hiddenText;
        dynTextDiv.style.display = 'block';
      } else {
        dynTextDiv.style.display = 'none';
      }
    } 
    // 2, 7, 10問目用: Mondo
    else if (q.Config.type === 'mondo') {
      const elapsedSec = Math.floor((now - new Date(q.Config.startTime)) / 1000);
      if (elapsedSec > 0) {
        const revealedCount = Math.floor(elapsedSec / q.Config.intervalSec);
        let displayText = Array(q.Config.text.length).fill('■');
        for (let i = 0; i < revealedCount && i < q.Config.order.length; i++) {
          const charIndex = q.Config.order[i];
          displayText[charIndex] = q.Config.text[charIndex];
        }
        dynTextDiv.innerText = displayText.join('');
        dynTextDiv.style.display = 'block';
      } else {
        dynTextDiv.style.display = 'none';
      }
    }
  }

  // クールタイム制御
  const lastMistakeTime = localStorage.getItem(`mistake_${q.ID}`);
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('cooltime-message');
  
  if (lastMistakeTime && !localStorage.getItem(`cleared_${q.ID}`)) {
    const penaltyEnd = new Date(parseInt(lastMistakeTime) + (q.CoolTime * 1000));
    if (now < penaltyEnd) {
      const remain = Math.ceil((penaltyEnd - now) / 1000);
      btn.disabled = true;
      msg.innerText = `クールタイム中: 残り ${remain} 秒`;
    } else {
      btn.disabled = false;
      msg.innerText = "";
    }
  }
}

// --- 解答の送信 ---
async function submitAnswer() {
  const q = questionsData.find(item => item.ID === currentQuestionId);
  let answerStr = "";

  if (q.Config && q.Config.type === 'multi') {
    let ansArray = [];
    for (let i = 0; i < q.Config.required; i++) {
      ansArray.push(document.getElementById(`multi-ans-${i}`).value.trim());
    }
    answerStr = ansArray.join(',');
  } else {
    answerStr = document.getElementById('answer-input').value.trim();
  }

  if (!answerStr || answerStr === Array(q.Config?.required || 1).fill('').join(',')) {
    return alert("解答を入力してください");
  }

  document.getElementById('submit-btn').disabled = true;
  document.getElementById('submit-btn').innerText = "送信中...";

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        playerName: playerName,
        questionId: currentQuestionId,
        answer: answerStr
      })
    });
    const result = await res.json();
    
    if (result.isCorrect) {
      alert("正解です！");
      localStorage.setItem(`cleared_${currentQuestionId}`, "true");
      showHomeScreen();
    } else {
      alert("不正解...");
      localStorage.setItem(`mistake_${currentQuestionId}`, new Date().getTime());
      if (document.getElementById('answer-input')) {
        document.getElementById('answer-input').value = '';
      }
    }
  } catch (e) {
    alert("通信エラーが発生しました");
  } finally {
    const btn = document.getElementById('submit-btn');
    btn.disabled = false;
    btn.innerText = "解答する";
    updateUI();
  }
}

// --- 画像モーダルの制御 ---
function openModal(imgSrc) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  modalImg.src = imgSrc;
  modal.style.display = "block";
}

function closeModal() {
  document.getElementById('image-modal').style.display = "none";
}
