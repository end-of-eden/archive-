# Synapse Archive

NAI 작품 저장용 개인 갤러리. GitHub Pages로 배포하고, GitHub API로 직접 이미지·프롬프트를 커밋하는 정적 사이트입니다. 로그인 없음, 서버 없음, 오직 자하님 혼자 씁니다.

## 배포 순서

1. **저장소 만들기**
   - GitHub에서 새 저장소 생성 (예: `synapse-archive`), Public으로 설정
   - 이 폴더 안의 `index.html`, `data.json`을 저장소 루트에 커밋 & 푸시
   - `images/` 폴더는 첫 업로드 시 자동으로 생성되니 미리 안 만들어도 됩니다

2. **GitHub Pages 켜기**
   - 저장소 → Settings → Pages
   - Source를 `Deploy from a branch`로, Branch는 `main` / `(root)`로 설정
   - 몇 분 후 `https://{계정}.github.io/{저장소이름}/` 으로 접속 가능

3. **Personal Access Token 발급** (업로드용)
   - GitHub → 우측 상단 프로필 → Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - `Generate new token`
   - Repository access: 이 저장소만 선택
   - Permissions → Repository permissions → **Contents: Read and write**
   - 생성 후 토큰 문자열 복사 (한 번만 보여줌)

4. **사이트에서 설정**
   - 사이트 우측 상단 ⚙ 버튼 클릭
   - GitHub 계정명, 저장소 이름, 브랜치(main), 토큰 입력 후 저장
   - 이 정보는 브라우저 로컬 저장소에만 남고, 절대 커밋되지 않습니다

## 주의

- **토큰이 브라우저에 저장되므로 사이트 링크를 절대 남에게 공유하지 마세요.** 개인용 도구입니다.
- 업로드하면 GitHub에 커밋 → GitHub Pages가 재배포되는 데 보통 30초~2분 정도 걸립니다.
- 이미지가 많이 쌓이면 저장소 용량이 커질 수 있어요 (git은 대용량 바이너리에 최적화되어 있지 않음). 개인 아카이브 규모(수백~수천 장)에서는 문제없지만, 너무 커지면 별도 스토리지로 옮기는 걸 고려하세요.
