pipeline {

  agent any

  triggers {
    githubPush()
  }

  environment {
    DOCKERHUB_USER = 'sh1tc0derdocker'
    IMAGE_APP      = "${DOCKERHUB_USER}/sirius-app"
    DEPLOY_DIR     = '/root/sirius_achievements'
    NOTIFY_EMAIL   = 'efirkoumir@gmail.com,yaroslavroch2@gmail.com,matveys909@gmail.com,sh1tc0der@yandex.ru'
  }

  stages {

    stage('Check Tag') {
      steps {
        script {
          env.IMAGE_TAG = sh(
            script: "git describe --tags --exact-match 2>/dev/null || echo ''",
            returnStdout: true
          ).trim()

          if (env.IMAGE_TAG == '') {
            currentBuild.result = 'NOT_BUILT'
            error('No tag on this commit - skipping deployment')
          }

          echo "Tag found: ${env.IMAGE_TAG} - starting deployment"
        }
      }
    }

    stage('Checkout') {
      steps {
        checkout scm
        echo "Repository cloned, branch: prod, tag: ${env.IMAGE_TAG}"
      }
    }

    stage('Build') {
      steps {
        script {
          sh """
            docker pull ${IMAGE_APP}:latest || true
            docker build \
              --cache-from ${IMAGE_APP}:latest \
              --build-arg BUILDKIT_INLINE_CACHE=1 \
              -t ${IMAGE_APP}:${env.IMAGE_TAG} \
              -t ${IMAGE_APP}:latest \
              .
          """
        }
      }
    }

    stage('Push to Docker Hub') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'dockerhub-creds',
          usernameVariable: 'DH_USER',
          passwordVariable: 'DH_PASS'
        )]) {
          sh """
            echo "\$DH_PASS" | docker login -u "\$DH_USER" --password-stdin
            docker push ${IMAGE_APP}:${env.IMAGE_TAG}
            docker push ${IMAGE_APP}:latest
            docker logout
          """
        }
      }
    }

    stage('Save Current Version') {
      steps {
        script {
          sh """
            PREV=\$(docker inspect --format='{{index .RepoTags 0}}' sirius_app_new 2>/dev/null || echo '')
            echo "\$PREV" > /tmp/sirius_prev_tag.txt
            echo "Current running version: \$PREV"
          """
        }
      }
    }

    stage('Deploy') {
      steps {
        script {
          sh """
            cd ${DEPLOY_DIR}

            echo "Stopping current web service..."
            docker compose stop web

            echo "Starting new version ${env.IMAGE_TAG}..."
            APP_IMAGE=${IMAGE_APP}:${env.IMAGE_TAG} \
            docker compose up -d --no-deps --pull always web

            echo "Waiting for container to start..."
            sleep 100
          """
        }
      }
    }

    stage('Health Check') {
      steps {
        script {
          sh """
            STATUS=\$(docker inspect --format='{{.State.Status}}' sirius_app_new 2>/dev/null || echo 'missing')
            echo "Container status: \$STATUS"
            if [ "\$STATUS" != "running" ]; then
              echo "Container is not running!"
              exit 1
            fi
          """

          sh """
            HTTP=\$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 https://emercom.online/health || echo '000')
            echo "Health endpoint returned: \$HTTP"
            if [ "\$HTTP" != "200" ]; then
              echo "Health check failed! Got HTTP \$HTTP"
              exit 1
            fi
          """
        }
      }
    }

  }

  post {

    failure {
      script {
        echo "Deployment failed - starting rollback..."
        sh """
          PREV=\$(cat /tmp/sirius_prev_tag.txt 2>/dev/null || echo '')
          if [ -n "\$PREV" ]; then
            echo "Rolling back to: \$PREV"
            cd ${DEPLOY_DIR}
            docker compose stop web
            docker tag "\$PREV" ${IMAGE_APP}:latest
            docker compose up -d --no-deps web
            echo "Rollback complete"
          else
            echo "No previous version found - skipping rollback"
          fi
        """
      }

      mail(
        to: "${env.NOTIFY_EMAIL}",
        subject: "Deployment failed - ${env.IMAGE_TAG} - ${env.JOB_NAME}",
        body: """
Deployment failed.

Project: ${env.JOB_NAME}
Tag:     ${env.IMAGE_TAG}
Branch:  prod
Build:   #${env.BUILD_NUMBER}

Logs:
${env.BUILD_URL}console
        """.stripIndent()
      )
    }

    success {
      mail(
        to: "${env.NOTIFY_EMAIL}",
        subject: "Deployment succeeded - ${env.IMAGE_TAG} - ${env.JOB_NAME}",
        body: """
Deployment succeeded.

Project: ${env.JOB_NAME}
Tag:     ${env.IMAGE_TAG}
Branch:  prod
Build:   #${env.BUILD_NUMBER}

Logs:
${env.BUILD_URL}console
        """.stripIndent()
      )

      sh "docker image prune -f --filter 'until=72h'"
    }

  }

}
