#!/bin/sh
VERSION=$(<.version)

PROJECT_STATUS=$(curl -X PROPFIND -o /dev/null -sw '%{http_code}' -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/${PROJECT})
if echo $PROJECT_STATUS | grep 404 > /dev/null;
then
  echo "Making directory ${PROJECT}"
  curl -X MKCOL -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/${PROJECT}
  curl -X MKCOL -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/${PROJECT}/latest/
else 
  echo "Directory "${PROJECT}" already exists"
fi

VERSION_STATUS=$(curl -X PROPFIND -o /dev/null -sw '%{http_code}' -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/${PROJECT}/${VERSION})
if echo $VERSION_STATUS | grep 404 > /dev/null;
then
  echo "Making directory ${VERSION}"
  curl -X MKCOL -u ${USER}:${TOKEN} ${SERVER}/${UPLOAD_PATH}/${PROJECT}/${VERSION}
else 
  echo "Directory "${VERSION}" already exists"
fi

for FILE in "$@"
do
  echo "Uploading "${FILE}" to "${UPLOAD_PATH}/${PROJECT}
  curl -u ${USER}:${TOKEN} -T $FILE ${SERVER}/${UPLOAD_PATH}/${PROJECT}/latest/
  curl -u ${USER}:${TOKEN} -T $FILE ${SERVER}/${UPLOAD_PATH}/${PROJECT}/${VERSION}/
done