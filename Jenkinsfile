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
      def email = sh(script: 'git log -1 --pretty=%ae', returnStdout: true).trim()
      def to = email
      // GitHub hides some people's emails behind a noreply address
      if (email.toLowerCase().endsWith('users.noreply.github.com')) {
        to = email.toLowerCase().contains('gituser7477') ? '' : 'qasimalik@gmail.com'
      }
      if (to) {
        echo "Sending build result to ${to}"
        mail(
          to: to,
          subject: "Student Manager Part-II: ${currentBuild.currentResult} (#${env.BUILD_NUMBER})",
          body: "Build result: ${currentBuild.currentResult}\n\nJob: ${env.JOB_NAME}\nBuild: ${env.BUILD_URL}\n\nPlease review the Jenkins console output for details."
        )
      } else {
        echo 'Push made by the repo owner using a hidden email, skipping mail.'
      }
    }
  }
}
}
