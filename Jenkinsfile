pipeline {
  agent any
  triggers { githubPush() }
  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    stage('Build Check') {
      steps {
        script {
          docker.image('node:20-alpine').inside {
            sh 'node --check app.js'
          }
        }
      }
    }
    stage('Deploy') {
      steps {
        sh 'docker compose -p part2 -f docker-compose.jenkins.yml up -d'
      }
    }
  }
  post {
    always {
      script {
        def to = sh(
          script: '''git log -1 --pretty=%B | grep -Eio '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}' | head -1 || true''',
          returnStdout: true
        ).trim()
        if (to) {
          mail(
            to: to,
            subject: "Student Manager Part-II: ${currentBuild.currentResult} (#${env.BUILD_NUMBER})",
            body: "Build result: ${currentBuild.currentResult}\n\nJob: ${env.JOB_NAME}\nBuild: ${env.BUILD_URL}\n\nPlease review the Jenkins console output for details."
          )
        } else {
          echo 'No email address in commit message, skipping mail.'
        }
      }
    }
  }
}
