#!/bin/sh
set -e
VERSION=$(cat VERSION)
echo "Building version ${VERSION}"

make_path () {
  STATUS=$(curl -X PROPFIND -o /dev/null -sw '%{http_code}' -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/$1)
  if echo $STATUS | grep 404 > /dev/null;
  then
    echo "Making directory ${1}"
    curl -X MKCOL -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/$1
  else 
    echo "Directory "${1}" already exists"
  fi
}

render_markdown () {
  echo "Rendering markdown"
  curl -sX POST https://api.github.com/markdown -d "{\"text\": \"$(cat README.md | perl -pe 's/\n/\\n/g' | perl -pe 's/\"/\\"/g')\"}" > index.html
  echo "Uploading markdown to ${SERVER}/${UPLOAD_PATH}/${PROJECT}/"
  curl -u ${USER}:${TOKEN} -sT index.html ${SERVER}/${UPLOAD_PATH}/${PROJECT}/
  curl -u ${USER}:${TOKEN} -sT index.html ${SERVER}/${UPLOAD_PATH}/${PROJECT}/latest/
  curl -u ${USER}:${TOKEN} -sT index.html ${SERVER}/${UPLOAD_PATH}/${PROJECT}/${VERSION}/
}

create_release () {
  echo "Marking release ${VERSION} on GitHub"
  echo "{\"tag_name\":\"v${VERSION}\",\"target_commitish\":\"master\",\"name\":\"v${VERSION}\",\"body\":\"Take-Five version ${VERSION}\"}" > release.json
  echo curl -u ${GH_USER}:${GH_TOKEN} -sX POST https://api.github.com/repos/toddself/take-five/releases -d @release.json
}

make_path $PROJECT
make_path $PROJECT/latest
make_path $PROJECT/$VERSION

for FILE in "$@"
do
  echo "Uploading "${FILE}" to "${UPLOAD_PATH}/${PROJECT}
  curl -u ${USER}:${TOKEN} -sT $FILE ${SERVER}/${UPLOAD_PATH}/${PROJECT}/latest/
  curl -u ${USER}:${TOKEN} -sT $FILE ${SERVER}/${UPLOAD_PATH}/${PROJECT}/${VERSION}/
done

render_markdown
create_release