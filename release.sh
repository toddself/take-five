#!/bin/sh
set -e
VERSION=$(<.version)

make_path () {
  STATUS=$(curl -X PROPFIND -o /dev/null -sw '%{http_code}' -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/$1)
  if echo $STATUS | grep 404 > /dev/null;
  then
    echo "Making directory ${1}"
    echo curl -X MKCOL -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/$1
  else 
    echo "Directory "${1}" already exists"
  fi
}

render_markdown () {
  echo "Rendering markdown"
  curl -sX POST https://api.github.com/markdown -d "{\"text\": \"$(cat README.md | perl -pe 's/\n/\\n/g' | perl -pe 's/\"/\\"/g')\"}" > index.html
  echo "Uploading markdown to ${SERVER}/${UPLOAD_PATH}/${PROJECT}/"
  curl -u ${USER}:${TOKEN} -T index.html ${SERVER}/${UPLOAD_PATH}/${PROJECT}/
  curl -u ${USER}:${TOKEN} -T index.html ${SERVER}/${UPLOAD_PATH}/${PROJECT}/latest/
  curl -u ${USER}:${TOKEN} -T index.html ${SERVER}/${UPLOAD_PATH}/${PROJECT}/${VERSION}/
}

make_path $PROJECT
make_path $PROJECT/latest
make_path $PROJECT/$VERSION

for FILE in "$@"
do
  echo "Uploading "${FILE}" to "${UPLOAD_PATH}/${PROJECT}
  curl -u ${USER}:${TOKEN} -T $FILE ${SERVER}/${UPLOAD_PATH}/${PROJECT}/latest/
  curl -u ${USER}:${TOKEN} -T $FILE ${SERVER}/${UPLOAD_PATH}/${PROJECT}/${VERSION}/
done

render_markdown