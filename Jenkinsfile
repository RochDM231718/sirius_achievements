pipeline {

  agent any

  triggers {
    githubPush()
  }

  environment {
    DOCKERHUB_USER = 'sh1tc0derdocker'
    IMAGE_APP      = "${DOCKERHUB_USER}/sirius-app"
    IMAGE_AI       = "${DOCKERHUB_USER}/sirius-ai-service"
    DEPLOY_DIR     = '/root/sirius_achievements'
    NOTIFY_EMAIL   = 'efirkoumir@gmail.com,yaroslavroch2@gmail.com,matveys909@gmail.com,sh1tc0der@yandex.ru'
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        echo "Repository cloned, branch: prod"
      }
    }

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

          env.DEPLOY_REF = "tag ${env.IMAGE_TAG}"
          echo "Using ${env.DEPLOY_REF}"
        }
      }
    }

    stage('Build') {
      steps {
        script {
          sh """
            docker pull ${IMAGE_APP}:latest || true
            docker pull ${IMAGE_AI}:latest || true

            docker build \
              --cache-from ${IMAGE_APP}:latest \
              --build-arg BUILDKIT_INLINE_CACHE=1 \
              -t ${IMAGE_APP}:${env.IMAGE_TAG} \
              -t ${IMAGE_APP}:latest \
              .

            docker build \
              --cache-from ${IMAGE_AI}:latest \
              --build-arg BUILDKIT_INLINE_CACHE=1 \
              -t ${IMAGE_AI}:${env.IMAGE_TAG} \
              -t ${IMAGE_AI}:latest \
              ./ai-service
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
            docker push ${IMAGE_AI}:${env.IMAGE_TAG}
            docker push ${IMAGE_AI}:latest
            docker logout
          """
        }
      }
    }

    stage('Save Current Version') {
      steps {
        script {
          sh """
            PREV_APP=\$(docker inspect --format='{{.Config.Image}}' sirius_app_new 2>/dev/null || echo '')
            PREV_AI=\$(docker inspect --format='{{.Config.Image}}' sirius_ai_service 2>/dev/null || echo '')
            echo "\$PREV_APP" > /tmp/sirius_prev_app_image.txt
            echo "\$PREV_AI" > /tmp/sirius_prev_ai_image.txt
            echo "Current running web image: \$PREV_APP"
            echo "Current running ai image: \$PREV_AI"
          """
        }
      }
    }

    stage('Deploy') {
      steps {
        script {
          sh """
            cd ${DEPLOY_DIR}

            echo "Stopping current web and ai services..."
            docker compose stop web ai_service || true

            echo "Starting new version ${env.IMAGE_TAG}..."
            AI_IMAGE=${IMAGE_AI}:${env.IMAGE_TAG} \
            APP_IMAGE=${IMAGE_APP}:${env.IMAGE_TAG} \
            docker compose up -d --no-deps --pull always ai_service web

            echo "Waiting for containers to start..."
            sleep 100
          """
        }
      }
    }

    stage('Health Check') {
      steps {
        script {
          sh """
            APP_STATUS=\$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' sirius_app_new 2>/dev/null || echo 'missing')
            AI_STATUS=\$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' sirius_ai_service 2>/dev/null || echo 'missing')
            echo "Web status: \$APP_STATUS"
            echo "AI status: \$AI_STATUS"
            if [ "\$APP_STATUS" != "healthy" ]; then
              echo "Web container is not healthy!"
              exit 1
            fi
            if [ "\$AI_STATUS" != "healthy" ]; then
              echo "AI container is not healthy!"
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
          PREV_APP=\$(cat /tmp/sirius_prev_app_image.txt 2>/dev/null || echo '')
          PREV_AI=\$(cat /tmp/sirius_prev_ai_image.txt 2>/dev/null || echo '')
          if [ -n "\$PREV_APP" ] && [ -n "\$PREV_AI" ]; then
            echo "Rolling back web to: \$PREV_APP"
            echo "Rolling back ai to: \$PREV_AI"
            cd ${DEPLOY_DIR}
            docker compose stop web ai_service || true
            AI_IMAGE="\$PREV_AI" \
            APP_IMAGE="\$PREV_APP" \
            docker compose up -d --no-deps ai_service web
            echo "Rollback complete"
          else
            echo "No previous images found - skipping rollback"
          fi
        """
      }

      mail(
        to: "${env.NOTIFY_EMAIL}",
        subject: "Deployment failed - ${env.IMAGE_TAG} - ${env.JOB_NAME}",
        body: """
Deployment failed.

Project: ${env.JOB_NAME}
Ref:     ${env.DEPLOY_REF}
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
Ref:     ${env.DEPLOY_REF}
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
